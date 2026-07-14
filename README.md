# Progressão

Web app leve (PWA) para registrar carga e repetições de treino de musculação,
otimizado para uso no celular na academia. O foco é uma coisa: ao abrir um
exercício, você vê **o que fez da última vez** naquele mesmo exercício (a "meta
a bater") para progredir a carga.

Plano embutido: 4 semanas, 4 dias de força + corrida (walk-run progressivo).

---

## Como rodar localmente

O app é só arquivos estáticos. O único requisito é servir por HTTP (o service
worker não funciona abrindo o arquivo direto via `file://`; `localhost` serve):

```bash
cd web-set-tracker
python3 -m http.server 8080
```

Abra `http://localhost:8080` no navegador. Para testar como no celular, use o
modo dispositivo do DevTools (Chrome: `Ctrl/Cmd+Shift+M`).

Qualquer servidor estático serve igual (`npx serve`, Nginx, GitHub Pages, etc.).

## Como instalar como PWA no iPhone (obrigatório no iOS via Safari)

O iOS **não** mostra prompt automático de instalação — o app tem um lembrete
interno, mas o passo é manual:

1. Abra o app **no Safari** (só o Safari instala PWA no iOS).
2. Toque no botão **Compartilhar** (quadrado com seta pra cima).
3. Escolha **"Adicionar à Tela de Início"**.
4. Abra pelo ícone na tela inicial — ele roda em tela cheia, sem a barra do
   Safari, respeitando o notch/Dynamic Island e a barra inferior.

No Android/Chrome, use o menu → "Instalar app" / "Adicionar à tela inicial".

---

## Decisões técnicas

### Stack: HTML + CSS + JavaScript vanilla, sem build
Sem framework, sem bundler, sem dependências. Justificativa: o app é pequeno e
o requisito é rodar como arquivo(s) estático(s) sem backend. Sem etapa de build,
o service worker fica trivial (lista fixa de arquivos) e não há nada para
compilar, instalar ou manter atualizado. Menos peças = mais confiável offline.

Arquivos:

- `index.html` — app inteiro (CSS e JS inline, para o shell ser um só recurso).
- `manifest.webmanifest` — metadados do PWA (nome, ícones, tela cheia).
- `sw.js` — service worker (precache do shell, estratégia *cache-first*).
- `icons/` — ícones PNG (180 p/ iOS, 192/512 e 512 maskable p/ o manifest).

### Persistência: `localStorage`
O volume de dados é minúsculo (4 semanas × 4 dias × ~6 exercícios × ~3 séries ×
2 números). Para esse tamanho, `localStorage` é a escolha certa: API síncrona,
código simples, sem estado assíncrono para dar errado, e o estado inteiro é um
único JSON — o que torna export/import triviais. IndexedDB seria overkill aqui.

O salvamento é **automático**: cada vez que você edita um campo, o valor é
gravado na hora (não existe botão "salvar").

### ⚠️ iOS apaga storage após ~7 dias — por isso, faça backup
No iPhone (WebKit), tanto `localStorage` quanto IndexedDB podem ser **apagados
automaticamente após ~7 dias sem uso do site**. Duas defesas:

1. **Instale o app na tela inicial** (passo a passo acima). No modo standalone,
   essa limpeza automática é drasticamente reduzida.
2. **Exporte o backup de tempos em tempos.** O app mostra um lembrete leve
   quando o último backup passou de ~7 dias.

## Como fazer backup do progresso

Na parte de baixo de qualquer tela há a seção **Backup**:

- **Exportar JSON** — baixa um arquivo `progressao-backup-AAAA-MM-DD.json` com
  100% do seu progresso. Guarde onde quiser (e-mail para você mesmo, iCloud
  Drive, Google Drive, etc.).
- **Importar JSON** — selecione um backup exportado para **restaurar tudo**.
  A importação substitui o progresso atual (pede confirmação antes).

Dica: exporte depois de treinos importantes e antes de trocar de aparelho ou
limpar o navegador.

---

## Como usar

1. Escolha a **Semana** (S1–S4) e o **Dia** (Dia 1–4, ou **Corrida**) no topo.
2. Em cada exercício, preencha **kg** e **reps** de cada série. Salva sozinho.
3. Abaixo de cada série aparece a **meta a bater** — o registro da vez anterior
   mais recente daquele mesmo exercício/série (idealmente a semana passada).
   Toque em **copiar** para trazer os valores anteriores e então superá-los.
4. **Corrida** mostra só o protocolo da semana, sem campos.
5. **Limpar este dia** apaga os registros do dia/semana atuais (com confirmação).

## Fora de escopo (v1)
Sem gráficos, estatística de volume, cálculo de progressão/deload, contas de
usuário, sincronização em nuvem ou timers. De propósito enxuto.
