'use client'

import { useState, useTransition } from 'react'
import { CircleCheck, FileText, Send, Trash2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  aceitarTermo, concluirEnvio, excluirArquivoPeloLink, guardarDadosPeloLink, prepararEnvioPeloLink, registrarArquivoPeloLink,
} from '@/app/actions/verificacao-publica'
import { botaoDoMembro, botaoFantasma, campoDoMembro } from '@/components/membro/marca'
import { LinkExterno, Recado, Secao } from '@/components/membro/pecas'
import { RotuloDeEnvio } from '@/components/membro/perfil'
import type { ArquivoEnviado, ReferenciaEnviada, VerificacaoAberta } from '@/lib/participantes/verificacao/link'
import {
  CATEGORIAS_DE_DOCUMENTO, DIAS_DO_LINK, LINKS, REFERENCIAS_MAXIMAS, REFERENCIAS_MINIMAS, atestadoAceitavel, somarDias, type CategoriaDeDocumento, type Lado,
} from '@/lib/participantes/verificacao/regras'
import { tamanhoLegivel } from '@/lib/rh/regras'
import { ErroDoDocumento, prepararDocumento } from './preparar'

type Passo = 'termo' | 'documento' | 'atestado' | 'registro' | 'referencias' | 'revisar'
const TITULOS: Record<Passo, string> = {
  termo: 'Termo e CPF', documento: 'Documento com foto', atestado: 'Atestado de antecedentes', registro: 'Registro profissional', referencias: 'Referências', revisar: 'Revisar e enviar',
}
const CONSELHOS = ['COREN', 'CRM', 'CRP', 'CREFITO', 'CRN', 'CRESS', 'OAB', 'CREA', 'CRO', 'CRF', 'Outro']
const cartao = 'rounded-xl border border-border bg-card p-4 sm:p-5'
const rotulo = 'flex flex-col gap-1 text-sm font-medium'

/**
 * O que o candidato preenche pelo link, um passo por vez, gravando ao avançar
 * (ele pode fechar e voltar: o que já subiu fica). Nenhum dado do cadastro
 * aparece aqui — quem tiver o link não lê nada. Celular primeiro: campos de
 * 44px, um por linha, e a foto do documento sai da câmera ou da galeria.
 */
export function FormularioDaVerificacao({ token, dados, hoje }: { token: string; dados: VerificacaoAberta; hoje: string }) {
  const renovacao = dados.escopo === 'renovacao'
  const passos: Passo[] = renovacao ? ['termo', 'atestado', 'revisar'] : ['termo', 'documento', 'atestado', 'registro', 'referencias', 'revisar']
  const [passo, setPasso] = useState<Passo>(dados.termoAceito ? passos[1] : 'termo')
  const [arquivos, setArquivos] = useState<ArquivoEnviado[]>(dados.arquivos)
  const [referencias, setReferencias] = useState<ReferenciaEnviada[]>(dados.referencias)
  const [registro, setRegistro] = useState(dados.registroProfissional)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const indice = passos.indexOf(passo)
  const ir = (n: number) => { setErro(''); setPasso(passos[Math.min(passos.length - 1, Math.max(0, n))]); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  if (pronto) {
    return (
      <Recado tipo="sucesso" titulo="Pronto, obrigado!">
        Seus documentos chegaram à coordenação do Voluntariado, que vai conferir tudo e falar com você. Este link não vale mais.
      </Recado>
    )
  }

  const dos = (categoria: CategoriaDeDocumento, lado?: Lado) => arquivos.filter((a) => a.categoria === categoria && (!lado || a.lado === lado))
  const temIdentidade = dos('documento_identidade').length > 0
  const temAtestado = arquivos.some((a) => a.categoria === 'antecedentes_pcerj' || a.categoria === 'antecedentes_pf')
  const navegacao = (p: { podeSeguir?: boolean; aoSeguir?: () => void } = {}) => <Navegacao ocupado={ocupado} aoVoltar={indice > 1 ? () => ir(indice - 1) : null} podeSeguir={p.podeSeguir ?? true} aoSeguir={p.aoSeguir} />

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Passos">
        {passos.map((p, i) => (
          <li key={p} aria-current={p === passo ? 'step' : undefined} className={p === passo ? 'font-semibold text-foreground' : i < indice ? 'text-(--success-texto)' : ''}>
            {i + 1}. {TITULOS[p]}
          </li>
        ))}
      </ol>

      {passo === 'termo' && (
        <form className="flex flex-col gap-4" onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          iniciar(async () => {
            setErro('')
            const r = await aceitarTermo(token, f)
            if (r.erro) { setErro(r.erro); return }
            ir(1)
          })
        }}>
          <Secao titulo="Termo de verificação e tratamento de dados" className={cartao}>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-background p-3 text-sm leading-relaxed [&_p]:mb-2">
              <p><strong>Para quê.</strong> A Cruz Vermelha Brasileira – Filial do Rio de Janeiro confere a identidade, os antecedentes e as referências de quem se candidata ao voluntariado, antes de aprovar a inscrição e a cada 6 meses enquanto a pessoa atuar. É o que a Lei 14.811/2024 (art. 59-A do Estatuto da Criança e do Adolescente) exige de instituições que atendem crianças e adolescentes, e o que a política de proteção da Federação Internacional da Cruz Vermelha pede.</p>
              <p><strong>O que você envia.</strong> Foto do seu documento de identificação com foto (RG, CNH ou RNE), o atestado de antecedentes criminais (gratuito, emitido por você no site da Polícia Civil do RJ), o contato de duas pessoas fora da sua família que possam falar de você e, se tiver, o seu registro em conselho profissional. O CPF informado abaixo fica guardado cifrado no seu cadastro.</p>
              <p><strong>Leitura automatizada e transferência internacional.</strong> A imagem do documento é lida por um sistema de inteligência artificial (Claude, da Anthropic, com servidores nos Estados Unidos) só para transcrever o que está impresso e comparar com o seu cadastro; o arquivo não é usado para treinar modelos. A decisão sobre a sua inscrição é sempre de uma pessoa da coordenação (LGPD, art. 20). Não fazemos reconhecimento facial.</p>
              <p><strong>Consultas públicas.</strong> Com o seu CPF, consultamos as bases públicas da Controladoria-Geral da União (sanções e pessoas expostas politicamente) pelo Portal da Transparência. A coordenação pode ainda conferir o código do atestado no site da Polícia Civil e o seu registro no site do conselho.</p>
              <p><strong>Quem acessa e por quanto tempo.</strong> Só a coordenação do Voluntariado com acesso a dados sensíveis abre o documento e o atestado; cada abertura fica registrada com nome e data. Os arquivos ficam cifrados em armazenamento privado enquanto você for voluntário(a) e por 5 anos depois, para comprovar o cumprimento da lei; depois são apagados. Inscrição recusada tem os documentos apagados na hora.</p>
              <p><strong>Seus direitos.</strong> Você pode pedir acesso, correção ou eliminação dos seus dados, e revogar este consentimento, pelo e-mail voluntariado@cruzvermelhariodejaneiro.org — sem o atestado, porém, a lei não permite a atuação com crianças e adolescentes.</p>
            </div>
            <label className={rotulo} htmlFor="v-cpf">
              {dados.temCpf ? 'Confirme o seu CPF (o mesmo da inscrição)' : 'Seu CPF'}
              <input id="v-cpf" name="cpf" inputMode="numeric" autoComplete="off" required minLength={11} maxLength={14} placeholder="000.000.000-00" className={campoDoMembro} />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="aceito" value="sim" required className="mt-1 size-4 shrink-0 accent-primary" />
              <span>Li o termo e autorizo a Cruz Vermelha RJ a fazer esta verificação, inclusive a leitura automatizada do meu documento e as consultas públicas.</span>
            </label>
          </Secao>
          {erro && <Recado tipo="erro">{erro}</Recado>}
          <div className="flex justify-end"><button type="submit" className={botaoDoMembro} disabled={ocupado}><RotuloDeEnvio ocupado={ocupado} rotulo="Aceitar e continuar" andamento="Guardando…" /></button></div>
        </form>
      )}

      {passo === 'documento' && (
        <div className="flex flex-col gap-4">
          <Secao titulo="Documento com foto" className={cartao}>
            <p className="text-sm text-muted-foreground">RG, CNH ou RNE. Tire a foto com o documento apoiado, sem reflexo, com todos os dados legíveis — ou envie o PDF da CNH Digital. Até 20 MB.</p>
            <EnvioDeArquivo token={token} categoria="documento_identidade" lado="frente" rotulo="Frente (ou o PDF inteiro)" arquivos={dos('documento_identidade', 'frente')}
              onEnviado={(a) => setArquivos((x) => [...x, a])} onRemovido={(id) => setArquivos((x) => x.filter((a) => a.id !== id))} />
            <EnvioDeArquivo token={token} categoria="documento_identidade" lado="verso" rotulo="Verso" dica="Se mandou o PDF ou os dois lados numa foto só, pule." arquivos={dos('documento_identidade', 'verso')}
              onEnviado={(a) => setArquivos((x) => [...x, a])} onRemovido={(id) => setArquivos((x) => x.filter((a) => a.id !== id))} />
          </Secao>
          {erro && <Recado tipo="erro">{erro}</Recado>}
          {navegacao({ podeSeguir: temIdentidade, aoSeguir: () => ir(indice + 1) })}
          {!temIdentidade && <p className="text-xs text-muted-foreground">Envie ao menos a frente do documento para continuar.</p>}
        </div>
      )}

      {passo === 'atestado' && <PassoDoAtestado token={token} hoje={hoje} arquivos={arquivos} setArquivos={setArquivos} erro={erro} navegacao={navegacao({ podeSeguir: temAtestado, aoSeguir: () => ir(indice + 1) })} />}

      {passo === 'registro' && (
        <form className="flex flex-col gap-4" onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          iniciar(async () => {
            setErro('')
            const r = await guardarDadosPeloLink(token, f)
            if (r.erro) { setErro(r.erro); return }
            const tem = f.get('registro_tem') === 'sim'
            setRegistro({ tem, conselho: tem ? String(f.get('registro_conselho') ?? '') : null, numero: tem ? String(f.get('registro_numero') ?? '') : null, uf: tem ? String(f.get('registro_uf') ?? '') : null })
            ir(indice + 1)
          })
        }}>
          <input type="hidden" name="passo" value="registro" />
          <Secao titulo="Registro em conselho profissional" className={cartao}>
            <p className="text-sm text-muted-foreground">Enfermagem, medicina, psicologia, fisioterapia, nutrição, serviço social… Se você vai atuar na área, a coordenação confere o registro no site do conselho.</p>
            <RegistroProfissional inicial={registro} />
            <EnvioDeArquivo token={token} categoria="registro_profissional" rotulo="Carteira do conselho (opcional)" arquivos={dos('registro_profissional')}
              onEnviado={(a) => setArquivos((x) => [...x, a])} onRemovido={(id) => setArquivos((x) => x.filter((a) => a.id !== id))} />
          </Secao>
          {erro && <Recado tipo="erro">{erro}</Recado>}
          {navegacao()}
        </form>
      )}

      {passo === 'referencias' && (
        <form className="flex flex-col gap-4" onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          iniciar(async () => {
            setErro('')
            const r = await guardarDadosPeloLink(token, f)
            if (r.erro) { setErro(r.erro); return }
            const lidas: ReferenciaEnviada[] = []
            for (let i = 1; i <= REFERENCIAS_MAXIMAS; i++) {
              const nome = String(f.get(`ref_${i}_nome`) ?? '').trim()
              if (nome) lidas.push({ nome, relacao: String(f.get(`ref_${i}_relacao`) ?? ''), telefone: String(f.get(`ref_${i}_telefone`) ?? '') || null, email: String(f.get(`ref_${i}_email`) ?? '') || null })
            }
            setReferencias(lidas)
            ir(indice + 1)
          })
        }}>
          <input type="hidden" name="passo" value="referencias" />
          <Secao titulo="Duas pessoas que possam falar de você" className={cartao}>
            <p className="text-sm text-muted-foreground">Fora da família: chefe ou ex-chefe, professor, colega de outra instituição, líder comunitário. A coordenação pode entrar em contato com elas.</p>
            {Array.from({ length: REFERENCIAS_MAXIMAS }, (_, i) => i + 1).map((n) => {
              const r = referencias[n - 1]
              return (
                <fieldset key={n} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">Referência {n}{n > REFERENCIAS_MINIMAS ? ' (opcional)' : ''}</legend>
                  <label className={rotulo} htmlFor={`ref-${n}-nome`}>Nome<input id={`ref-${n}-nome`} name={`ref_${n}_nome`} defaultValue={r?.nome ?? ''} required={n <= REFERENCIAS_MINIMAS} maxLength={120} autoComplete="off" className={campoDoMembro} /></label>
                  <label className={rotulo} htmlFor={`ref-${n}-relacao`}>Relação com você<input id={`ref-${n}-relacao`} name={`ref_${n}_relacao`} defaultValue={r?.relacao ?? ''} required={n <= REFERENCIAS_MINIMAS} maxLength={120} placeholder="Ex.: chefe no hospital X" autoComplete="off" className={campoDoMembro} /></label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={rotulo} htmlFor={`ref-${n}-telefone`}>Telefone<input id={`ref-${n}-telefone`} name={`ref_${n}_telefone`} defaultValue={r?.telefone ?? ''} type="tel" maxLength={30} autoComplete="off" className={campoDoMembro} /></label>
                    <label className={rotulo} htmlFor={`ref-${n}-email`}>E-mail<input id={`ref-${n}-email`} name={`ref_${n}_email`} defaultValue={r?.email ?? ''} type="email" maxLength={254} autoComplete="off" className={campoDoMembro} /></label>
                  </div>
                </fieldset>
              )
            })}
          </Secao>
          <Secao titulo="Comprovante de residência (opcional)" className={cartao}>
            <EnvioDeArquivo token={token} categoria="comprovante_residencia" rotulo="Conta de luz, água ou telefone recente" arquivos={dos('comprovante_residencia')}
              onEnviado={(a) => setArquivos((x) => [...x, a])} onRemovido={(id) => setArquivos((x) => x.filter((a) => a.id !== id))} />
          </Secao>
          {erro && <Recado tipo="erro">{erro}</Recado>}
          {navegacao()}
        </form>
      )}

      {passo === 'revisar' && (
        <div className="flex flex-col gap-4">
          <Secao titulo="Confira antes de enviar" className={cartao}>
            <ul className="flex flex-col gap-2 text-sm">
              {!renovacao && <Item ok={temIdentidade} texto={`Documento com foto: ${dos('documento_identidade').length} arquivo(s)`} />}
              <Item ok={temAtestado} texto={temAtestado ? `Atestado de antecedentes: emitido em ${dataCurta(arquivos.find((a) => a.categoria === 'antecedentes_pcerj' || a.categoria === 'antecedentes_pf')?.dataDocumento)}` : 'Atestado de antecedentes: falta'} />
              {!renovacao && <Item ok texto={registro?.tem ? `Registro profissional: ${registro.conselho ?? ''} ${registro.numero ?? ''}${registro.uf ? `/${registro.uf}` : ''}` : 'Registro profissional: não tenho'} />}
              {!renovacao && <Item ok={referencias.length >= REFERENCIAS_MINIMAS} texto={referencias.length ? `Referências: ${referencias.map((r) => r.nome).join(', ')}` : 'Referências: faltam'} />}
            </ul>
            <p className="text-xs text-muted-foreground">Depois de enviar, este link para de valer. Se precisar corrigir algo, a coordenação manda um link novo.</p>
          </Secao>
          {erro && <Recado tipo="erro">{erro}</Recado>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className={botaoFantasma} onClick={() => ir(indice - 1)} disabled={ocupado}>Voltar</button>
            <button type="button" className={botaoDoMembro} disabled={ocupado || !temAtestado || (!renovacao && (!temIdentidade || referencias.length < REFERENCIAS_MINIMAS))} onClick={() => iniciar(async () => {
              setErro('')
              const r = await concluirEnvio(token)
              if (r.erro) { setErro(r.erro); return }
              setPronto(true)
            })}><RotuloDeEnvio ocupado={ocupado} icone={Send} rotulo="Enviar para a coordenação" andamento="Enviando…" /></button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Este link é pessoal e vale {DIAS_DO_LINK} dias. Pode fechar e voltar: o que já enviou fica guardado.</p>
    </div>
  )
}

const dataCurta = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—')

function Navegacao({ ocupado, aoVoltar, podeSeguir, aoSeguir }: { ocupado: boolean; aoVoltar: (() => void) | null; podeSeguir: boolean; aoSeguir?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
      {aoVoltar ? <button type="button" className={botaoFantasma} onClick={aoVoltar} disabled={ocupado}>Voltar</button> : <span />}
      <button type={aoSeguir ? 'button' : 'submit'} className={botaoDoMembro} disabled={ocupado || !podeSeguir} onClick={aoSeguir}>
        <RotuloDeEnvio ocupado={ocupado} rotulo="Continuar" andamento="Guardando…" />
      </button>
    </div>
  )
}

function Item({ ok, texto }: { ok: boolean; texto: string }) {
  return <li className="flex items-start gap-2"><CircleCheck className={`mt-0.5 size-4 shrink-0 ${ok ? 'text-(--success-texto)' : 'text-muted-foreground/40'}`} aria-hidden="true" /><span>{texto}</span></li>
}

function RegistroProfissional({ inicial }: { inicial: { tem: boolean; conselho: string | null; numero: string | null; uf: string | null } | null }) {
  const [tem, setTem] = useState(inicial?.tem ? 'sim' : 'nao')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2"><input type="radio" name="registro_tem" value="nao" checked={tem === 'nao'} onChange={() => setTem('nao')} className="size-4 accent-primary" />Não tenho registro em conselho profissional</label>
        <label className="flex items-center gap-2"><input type="radio" name="registro_tem" value="sim" checked={tem === 'sim'} onChange={() => setTem('sim')} className="size-4 accent-primary" />Tenho</label>
      </div>
      {tem === 'sim' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_5rem]">
          <label className={rotulo} htmlFor="reg-conselho">Conselho
            <select id="reg-conselho" name="registro_conselho" defaultValue={inicial?.conselho ?? 'COREN'} className={campoDoMembro}>{CONSELHOS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </label>
          <label className={rotulo} htmlFor="reg-numero">Número<input id="reg-numero" name="registro_numero" defaultValue={inicial?.numero ?? ''} required maxLength={40} autoComplete="off" className={campoDoMembro} /></label>
          <label className={rotulo} htmlFor="reg-uf">UF<input id="reg-uf" name="registro_uf" defaultValue={inicial?.uf ?? 'RJ'} maxLength={2} autoComplete="off" className={`${campoDoMembro} uppercase`} /></label>
        </div>
      )}
    </div>
  )
}

function PassoDoAtestado({ token, hoje, arquivos, setArquivos, erro, navegacao }: {
  token: string; hoje: string; arquivos: ArquivoEnviado[]; setArquivos: React.Dispatch<React.SetStateAction<ArquivoEnviado[]>>; erro: string; navegacao: React.ReactNode
}) {
  const [emitidoEm, setEmitidoEm] = useState('')
  const [codigo, setCodigo] = useState('')
  const [emitidoPf, setEmitidoPf] = useState('')
  const extras = (data: string, cod: string) => {
    const r = atestadoAceitavel(data, hoje)
    return r.ok ? { dataDocumento: data, codigo: cod.trim() || null } : { erro: data ? r.erro : 'Preencha a data em que o atestado foi emitido antes de escolher o arquivo.' }
  }
  return (
    <div className="flex flex-col gap-4">
      <Secao titulo="Atestado de antecedentes criminais" className={cartao}>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Abra o site da Polícia Civil do RJ: <LinkExterno href={LINKS.atestadoPcerj}>emitir o atestado</LinkExterno>. É gratuito e sai na hora.</li>
          <li>Preencha seus dados e salve o PDF (ou tire uma foto nítida do atestado impresso).</li>
          <li>Informe abaixo a data que aparece em “Emitido em” e envie o arquivo. O atestado vale 90 dias.</li>
        </ol>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={rotulo} htmlFor="at-data">Emitido em
            <input id="at-data" type="date" value={emitidoEm} onChange={(e) => setEmitidoEm(e.target.value)} min={somarDias(hoje, -90)} max={hoje} className={campoDoMembro} />
          </label>
          <label className={rotulo} htmlFor="at-codigo">Código de autenticação (opcional)
            <input id="at-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={80} autoComplete="off" placeholder="Fica no rodapé do atestado" className={campoDoMembro} />
          </label>
        </div>
        <EnvioDeArquivo token={token} categoria="antecedentes_pcerj" rotulo="O atestado (PDF ou foto)" arquivos={arquivos.filter((a) => a.categoria === 'antecedentes_pcerj')}
          extras={() => extras(emitidoEm, codigo)} onEnviado={(a) => setArquivos((x) => [...x, a])} onRemovido={(id) => setArquivos((x) => x.filter((a) => a.id !== id))} />
      </Secao>
      <details className={cartao}>
        <summary className="cursor-pointer text-sm font-semibold">Certidão da Polícia Federal (opcional)</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Também gratuita, em <LinkExterno href={LINKS.certidaoPf}>servicos.pf.gov.br</LinkExterno>. Vale como atestado se a da Polícia Civil estiver indisponível.</p>
          <label className={rotulo} htmlFor="pf-data">Emitida em<input id="pf-data" type="date" value={emitidoPf} onChange={(e) => setEmitidoPf(e.target.value)} min={somarDias(hoje, -90)} max={hoje} className={campoDoMembro} /></label>
          <EnvioDeArquivo token={token} categoria="antecedentes_pf" rotulo="A certidão (PDF)" arquivos={arquivos.filter((a) => a.categoria === 'antecedentes_pf')}
            extras={() => extras(emitidoPf, '')} onEnviado={(a) => setArquivos((x) => [...x, a])} onRemovido={(id) => setArquivos((x) => x.filter((a) => a.id !== id))} />
        </div>
      </details>
      {erro && <Recado tipo="erro">{erro}</Recado>}
      {navegacao}
    </div>
  )
}

/**
 * Um envio: o servidor dá um link de uso único, o navegador manda o arquivo
 * direto ao Storage, e o servidor registra e confere o conteúdo. A foto é
 * reduzida no aparelho antes de subir.
 */
function EnvioDeArquivo({ token, categoria, lado, rotulo: titulo, dica, arquivos, extras, onEnviado, onRemovido }: {
  token: string; categoria: CategoriaDeDocumento; lado?: Lado; rotulo: string; dica?: string; arquivos: ArquivoEnviado[]
  extras?: () => { dataDocumento?: string | null; codigo?: string | null; erro?: string }
  onEnviado: (a: ArquivoEnviado) => void; onRemovido: (id: string) => void
}) {
  const [etapa, setEtapa] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, iniciar] = useTransition()
  const id = `env-${categoria}-${lado ?? 'x'}`
  const enviar = (original: File) => iniciar(async () => {
    setErro('')
    const ex = extras?.() ?? {}
    if (ex.erro) { setErro(ex.erro); return }
    let arquivo: File
    try {
      setEtapa('Preparando…')
      arquivo = await prepararDocumento(original)
    } catch (causa) {
      setEtapa(''); setErro(causa instanceof ErroDoDocumento ? causa.message : 'Não foi possível preparar o arquivo.'); return
    }
    const p = await prepararEnvioPeloLink(token, categoria, arquivo.type, arquivo.size)
    if (p.erro || !p.caminho || !p.token) { setErro(p.erro ?? 'Não foi possível preparar o envio.'); setEtapa(''); return }
    setEtapa('Enviando…')
    const { error } = await createClient().storage.from('voluntarios-arquivos').uploadToSignedUrl(p.caminho, p.token, arquivo, { contentType: arquivo.type })
    if (error) { setErro('O envio falhou. Confira a conexão e tente de novo.'); setEtapa(''); return }
    setEtapa('Conferindo…')
    const r = await registrarArquivoPeloLink(token, p.caminho, original.name || arquivo.name, { categoria, lado: lado ?? null, dataDocumento: ex.dataDocumento ?? null, codigo: ex.codigo ?? null })
    setEtapa('')
    if (r.erro || !r.id) { setErro(r.erro ?? 'Não foi possível registrar o arquivo.'); return }
    onEnviado({ id: r.id, categoria, lado: lado ?? null, nome: original.name || arquivo.name, tamanho: arquivo.size, dataDocumento: ex.dataDocumento ?? null })
  })
  const remover = (arquivoId: string) => iniciar(async () => {
    setErro('')
    const r = await excluirArquivoPeloLink(token, arquivoId)
    if (r.erro) { setErro(r.erro); return }
    onRemovido(arquivoId)
  })
  return (
    <div className="flex flex-col gap-2" data-envio={categoria}>
      <p className="text-sm font-medium">{titulo}{dica && <span className="block text-xs font-normal text-muted-foreground">{dica}</span>}</p>
      {arquivos.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {arquivos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{a.nome} <span className="text-xs text-muted-foreground">· {tamanhoLegivel(a.tamanho)}{a.dataDocumento ? ` · emitido em ${dataCurta(a.dataDocumento)}` : ''}</span></span>
              <button type="button" onClick={() => remover(a.id)} disabled={ocupado} aria-label={`Remover ${a.nome}`} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={id} className={`inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-primary/50 bg-card px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 ${ocupado ? 'pointer-events-none opacity-60' : ''}`}>
        <Upload className="size-4" aria-hidden="true" />{etapa || (arquivos.length ? 'Enviar outro arquivo' : 'Escolher arquivo ou tirar foto')}
        <input id={id} type="file" accept="image/*,application/pdf" className="sr-only" disabled={ocupado} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) enviar(f) }} />
      </label>
      <p className="text-xs text-muted-foreground">{CATEGORIAS_DE_DOCUMENTO[categoria].dica}</p>
      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
    </div>
  )
}
