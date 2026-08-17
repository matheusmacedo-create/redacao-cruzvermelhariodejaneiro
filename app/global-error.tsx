'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Algo deu errado</h1>
          <p style={{ maxWidth: 420, fontSize: 14, color: '#666' }}>
            Se você acabou de salvar algo, a alteração provavelmente foi registrada — apenas esta tela não
            conseguiu atualizar.
          </p>
          <button
            onClick={() => reset()}
            style={{ borderRadius: 8, border: '1px solid #ccc', padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  )
}
