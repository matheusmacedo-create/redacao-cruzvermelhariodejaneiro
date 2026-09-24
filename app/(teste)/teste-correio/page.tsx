import { CorreioDosSetores } from '@/components/admin/correio-setores'
const setores = [{ id: 's1', nome: 'Comunicação Social', membros: ['p1'] }, { id: 's2', nome: 'Diretoria', membros: ['p1'] }]
const cx = (id: string, email: string, nome: string, nomeRemetente: string, setorId: string) => ({ id, email, nome, nomeRemetente, assinatura: '', setorId, ativa: true, noGmail: true, principal: false })
export default function Page() {
  return <div className="p-4"><CorreioDosSetores conexao={{ email: 'contato@x.org', estado: 'ativa', sincronizadaEm: null }} clienteConfigurado retorno="https://x/api/google/retorno"
    setores={setores} pessoas={[{ id: 'p1', nome: 'Ana' }]} aviso={null}
    caixas={[cx('c1', 'comunicacao@cruzvermelhariodejaneiro.org', 'comunicacao', '', 's1'), cx('c2', 'presidente@cruzvermelhariodejaneiro.org', 'presidente', 'CVB-RJ · Presidência', 's2'), cx('c3', 'ouvidoria@cruzvermelhariodejaneiro.org', 'Ouvidoria', '', 's2')]} /></div>
}
