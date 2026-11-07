import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Fala } from './voz'

/**
 * A montagem dos vídeos da ajuda (docs/AJUDA.md §14): as imagens capturadas da tela, as falas no ponto em que a voz
 * começou e a legenda. Sai um MP4 (H.264 e AAC, 1920×1080, pronto para tocar enquanto baixa), a capa e a legenda
 * WebVTT. Puro, menos o ffmpeg: as funções de legenda são conferidas em scripts/conferir-videos.ts.
 */

export type Quadro = { arquivo: string; t: number }
export type FalaNoVideo = { fala: Fala; inicio: number }
type Trecho = { de: number; ate: number }

/**
 * Uma legenda tem até duas linhas de ~42 letras. Frase maior se parte na vírgula que estiver no terço do meio; sem
 * ela, no espaço mais perto do meio (duas legendas do mesmo tamanho leem melhor do que uma curta e uma comprida).
 */
const TETO_DA_LEGENDA = 84

function partirNoMeio(texto: string, de: number, ate: number): Trecho[] {
  if (ate - de <= TETO_DA_LEGENDA) return [{ de, ate }]
  const tamanho = ate - de
  const meio = de + tamanho / 2
  const maisPertoDoMeio = (separador: string, inicio: number, fim: number) => {
    let corte = -1
    for (let i = inicio; i < fim; i++) {
      if (texto.startsWith(separador, i) && (corte < 0 || Math.abs(i - meio) < Math.abs(corte - meio))) corte = i
    }
    return corte
  }
  const virgula = maisPertoDoMeio(', ', Math.ceil(de + tamanho / 3), Math.floor(ate - tamanho / 3))
  const corte = virgula >= 0 ? virgula + 1 : maisPertoDoMeio(' ', de + 10, ate - 10)
  if (corte < 0) return [{ de, ate }]
  return [...partirNoMeio(texto, de, corte), ...partirNoMeio(texto, corte, ate)]
}

/** Os trechos de legenda de uma fala: uma frase por vez (ponto, interrogação, exclamação ou dois-pontos). */
export function trechosDaLegenda(texto: string): Trecho[] {
  const trechos: Trecho[] = []
  let de = 0
  for (let i = 0; i < texto.length; i++) {
    const fimDeFrase = /[.!?:;]/.test(texto[i]) && (i + 1 === texto.length || texto[i + 1] === ' ')
    if (fimDeFrase) { trechos.push(...partirNoMeio(texto, de, i + 1)); de = i + 1 }
  }
  if (de < texto.length && texto.slice(de).trim()) trechos.push(...partirNoMeio(texto, de, texto.length))
  // Sem o espaço do começo: o trecho começa na primeira letra.
  return trechos.map(({ de, ate }) => { while (texto[de] === ' ') de++; return { de, ate } }).filter((t) => t.ate > t.de)
}

/** Duas linhas equilibradas, quebradas no espaço mais perto do meio. */
export function linhasDaLegenda(texto: string): string {
  if (texto.length <= 42) return texto
  const meio = texto.length / 2
  let corte = -1
  for (let i = 0; i < texto.length; i++) if (texto[i] === ' ' && (corte < 0 || Math.abs(i - meio) < Math.abs(corte - meio))) corte = i
  return corte < 0 ? texto : `${texto.slice(0, corte)}\n${texto.slice(corte + 1)}`
}

const tempo = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000))
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), seg = Math.floor((ms % 60_000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

/** A legenda WebVTT: cada trecho aparece quando a voz começa a dizê-lo e sai quando termina (sem sobrepor o seguinte). */
export function legendaWebVtt(falas: FalaNoVideo[]): string {
  const deixas: { de: number; ate: number; texto: string }[] = []
  for (const { fala, inicio } of falas) {
    const n = fala.texto.length
    for (const t of trechosDaLegenda(fala.texto)) {
      const de = fala.letras ? fala.letras.inicio[t.de] : (fala.duracao * t.de) / n
      const ate = fala.letras ? fala.letras.fim[t.ate - 1] : (fala.duracao * t.ate) / n
      deixas.push({ de: inicio + de, ate: inicio + ate + 0.3, texto: fala.texto.slice(t.de, t.ate).trim() })
    }
  }
  for (let i = 0; i + 1 < deixas.length; i++) deixas[i].ate = Math.min(deixas[i].ate, deixas[i + 1].de)
  return `WEBVTT\n\n${deixas.map((d, i) => `${i + 1}\n${tempo(d.de)} --> ${tempo(d.ate)}\n${linhasDaLegenda(d.texto)}\n`).join('\n')}`
}

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] })
}

export function montarVideo(o: { quadros: Quadro[]; t0: number; tFim: number; falas: FalaNoVideo[]; pasta: string; nome: string }) {
  if (!o.quadros.length) throw new Error('Nenhuma imagem da tela foi capturada.')
  const duracao = o.tFim - o.t0
  // O quadro que está na tela no instante zero é o último capturado antes dele.
  const ordenados = [...o.quadros].sort((a, b) => a.t - b.t)
  let primeiro = 0
  ordenados.forEach((q, i) => { if (q.t <= o.t0) primeiro = i })
  const usados = ordenados.slice(primeiro).map((q, i) => ({ arquivo: q.arquivo, t: i === 0 ? 0 : q.t - o.t0 }))
  const linhas = ['ffconcat version 1.0']
  usados.forEach((q, i) => {
    const fim = i + 1 < usados.length ? usados[i + 1].t : duracao
    linhas.push(`file '${q.arquivo}'`, `duration ${Math.max(0.001, fim - q.t).toFixed(4)}`)
  })
  linhas.push(`file '${usados[usados.length - 1].arquivo}'`)
  const lista = path.join(o.pasta, `${o.nome}.quadros.txt`)
  writeFileSync(lista, `${linhas.join('\n')}\n`)

  const mp4 = path.join(o.pasta, `${o.nome}.mp4`)
  const entradas = o.falas.flatMap(({ fala }) => ['-i', fala.arquivo])
  const atrasos = o.falas.map(({ inicio }, i) => `[${i + 1}:a]adelay=${Math.round(inicio * 1000)}:all=1[a${i}]`).join(';')
  const mistura = `${o.falas.map((_, i) => `[a${i}]`).join('')}amix=inputs=${o.falas.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:LRA=11:TP=-1.5,aresample=48000,apad[voz]`
  ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', lista, ...entradas,
    '-filter_complex', `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=white,fps=30,format=yuv420p[img];${atrasos};${mistura}`,
    '-map', '[img]', '-map', '[voz]', '-t', duracao.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high', '-tune', 'stillimage',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4,
  ])
  // A capa é o cartão de abertura, com o título: quem vê a capa já sabe do que é o vídeo.
  const capa = path.join(o.pasta, `${o.nome}.jpg`)
  ffmpeg(['-ss', '1.2', '-i', mp4, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', capa])
  const vtt = path.join(o.pasta, `${o.nome}.vtt`)
  writeFileSync(vtt, legendaWebVtt(o.falas))
  return { mp4, capa, vtt, duracao }
}
