/**
 * Brazilian Portuguese strings — the app's original language.
 *
 * Must mirror the key structure of ./en.js exactly; tests/i18n.test.js enforces it.
 * Keys under `plan` are the frozen exercise/day ids from src/plan.js.
 */

export default {
  tag: "pt-BR",
  label: "Português (Brasil)",
  // Ordinals agree with "série" (feminine): 1ª, 2ª, 3ª…
  ordinal: (n) => `${n}ª`,

  strings: {
    app: {
      name: "Progression",
      description: "Registro de treino de musculação — mira em bater a carga anterior.",
      footer: "{app} · dados salvos localmente neste aparelho",
    },

    header: {
      week: "Semana",
      day: "Dia",
      weekChip: "S{n}",
      dayChip: "Dia {n}",
      runChip: "Corrida",
      context: "Semana {week}",
      contextRun: "Semana {week} · Corrida",
    },

    units: {
      kg: "kg",
      missing: "—",
    },

    exercise: {
      scheme: "{sets}×{min}-{max}",
      setCount: { one: "{n} série", other: "{n} séries" },
      weightPlaceholder: "kg",
      repsPlaceholder: "reps",
      weightAria: "carga da {set}ª série",
      repsAria: "repetições da {set}ª série",
      copy: "copiar",
      copyAria: "Copiar valores anteriores da {set}ª série",
      previous: "↳ última vez (S{week}): {weight} × {reps}",
      previousEmpty: "↳ sem registro anterior",
      addSetAria: "Adicionar série a {exercise}",
      removeSetAria: "Remover série de {exercise}",
      removeSetConfirm:
        "A {set}ª série de “{exercise}” tem dados que serão apagados. Remover mesmo assim?",
    },

    day: {
      clear: "Limpar este dia (Semana {week})",
      clearEmpty: "Este dia já está vazio.",
      clearConfirm: {
        one: "Limpar a Semana {week}, {day}? Apaga {n} registro e volta as séries ao padrão. Não dá para desfazer.",
        other:
          "Limpar a Semana {week}, {day}? Apaga {n} registros e volta as séries ao padrão. Não dá para desfazer.",
      },
    },

    run: {
      title: "Corrida — walk-run progressivo",
      protocol: "{protocol} · {reps}",
      totalNote: "Total aproximado: {total}",
      weekItem: "Semana {week}: {protocol}, {reps}",
      weekItemTotal: "Semana {week}: {protocol}, {reps} ({total})",
      logTitle: "Registro desta corrida",
      target: "alvo {reps}",
      fieldAria: "{field} da corrida",
      previous: "↳ última vez (S{week}): {values}",
      previousEmpty: "↳ sem corrida anterior",
      copyAria: "Copiar valores da corrida anterior",
      clear: "Limpar corrida (Semana {week})",
      clearEmpty: "Esta corrida já está vazia.",
      clearConfirm: "Limpar o registro da corrida da Semana {week}? Não dá para desfazer.",
      fields: {
        dist: { label: "Distância", unit: "km", placeholder: "km" },
        time: { label: "Tempo", unit: "min", placeholder: "min" },
        cycles: { label: "Ciclos feitos", unit: "", placeholder: "ciclos" },
      },
      valueDist: "{value} km",
      valueTime: "{value} min",
      valueCycles: { one: "{n} ciclo", other: "{n} ciclos" },
    },

    tools: {
      title: "Backup",
      export: "Exportar JSON",
      import: "Importar JSON",
      lastBackup: "Último backup: {when}",
      importConfirm: "Importar vai SUBSTITUIR todo o progresso atual. Continuar?",
      importDone: "Progresso importado com sucesso.",
      importInvalid: "Arquivo inválido. Selecione um backup JSON exportado pelo {app}.",
      readError: "Não foi possível ler o arquivo.",
    },

    settings: {
      title: "Ajustes",
      language: "Idioma",
    },

    banner: {
      backupTitle: "Faça um backup",
      backupBody: "Exporte seu progresso em JSON de tempos em tempos.",
      backupAction: "Exportar",
      dismissAria: "Dispensar",
      installTitle: "Instale na tela inicial",
      installBody:
        "Safari → Compartilhar → “Adicionar à Tela de Início”. Abre em tela cheia e protege seus dados.",
    },

    plan: {
      days: {
        d1: "Dia 1 — Peito + superiores",
        d2: "Dia 2 — Pernas (quadríceps)",
        d3: "Dia 3 — Costas + superiores",
        d4: "Dia 4 — Pernas (posterior)",
      },
      exercises: {
        "supino-reto": "Supino reto (barra ou halteres)",
        "supino-inclinado": "Supino inclinado com halteres",
        desenvolvimento: "Desenvolvimento com halteres",
        crucifixo: "Crucifixo ou crossover",
        "triceps-polia": "Tríceps na polia",
        "elevacao-lateral": "Elevação lateral",
        agachamento: "Agachamento livre",
        "leg-press": "Leg press",
        "hack-squat": "Hack squat",
        "panturrilha-pe": "Panturrilha em pé",
        "abdominal-d2": "Abdominal (prancha/elevação pernas)",
        "barra-fixa": "Barra fixa ou puxada alta",
        "remada-curvada": "Remada curvada (barra/halter)",
        "remada-sentada": "Remada sentada na polia",
        "face-pull": "Face pull",
        "rosca-direta": "Rosca direta",
        "rosca-martelo": "Rosca martelo",
        "terra-romeno": "Levantamento terra romeno",
        "cadeira-flexora": "Cadeira flexora",
        "cadeira-extensora": "Cadeira extensora",
        "panturrilha-sent": "Panturrilha sentado",
        "abdominal-d4": "Abdominal",
      },
      running: {
        1: { protocol: "1 min corrida leve / 2 min caminhada", reps: "6–8×", total: "~20 min" },
        2: { protocol: "2 min corrida / 1 min caminhada", reps: "6–7×", total: "" },
        3: { protocol: "3 min corrida / 1 min caminhada", reps: "5–6×", total: "" },
        4: { protocol: "5 min corrida / 1 min caminhada", reps: "4×", total: "" },
      },
    },
  },
};
