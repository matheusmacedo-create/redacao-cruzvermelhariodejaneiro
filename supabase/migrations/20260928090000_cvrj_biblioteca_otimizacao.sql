-- ============================================================
-- Biblioteca: arquivos que entram já leves (lib/midia/).
--
-- Foto vira JPEG de até 2048 px sem metadados; vídeo, MP4 H.264. Duas
-- colunas para saber o que já passou por isso e quanto economizou:
--
--   otimizado_em      quando o arquivo foi otimizado (no navegador, no
--                     servidor ou pelo botão "Otimizar arquivos antigos");
--                     null = ainda não passou (os anteriores a isto)
--   tamanho_original  o tamanho antes de otimizar, para mostrar a economia
--
-- Só acrescenta; as políticas de RLS de files continuam as mesmas.
-- ============================================================

alter table public.files add column if not exists otimizado_em timestamptz;
alter table public.files add column if not exists tamanho_original bigint check (tamanho_original is null or tamanho_original >= 0);

-- Os candidatos do "Otimizar arquivos antigos": fotos ainda não otimizadas.
create index if not exists files_nao_otimizadas_idx on public.files (workspace_id, size_bytes desc)
  where otimizado_em is null and file_type = 'foto';
