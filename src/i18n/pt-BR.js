/**
 * Brazilian Portuguese strings — the app's original language.
 *
 * Must mirror the key structure of ./en.js exactly; tests/i18n.test.js enforces it.
 * `catalog.exercises` is keyed by the exercise ids in src/catalog.js.
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
      weekAria: "Semana {n}",
      chipLogged: "{label}, registrado",
      context: "Semana {week}",
      contextPlans: "Planos",
      contextEditor: "Editando o plano",
      contextExercises: "Meus exercícios",
    },

    units: {
      kg: "kg",
      km: "km",
      min: "min",
      missing: "—",
    },

    exercise: {
      scheme: "{sets}×{min}-{max}",
      setCount: { one: "{n} série", other: "{n} séries" },
      columns: {
        kg: "kg",
        reps: "reps",
        dist: "km",
        time: "min",
      },
      pair: {
        strength: "×",
        cardio: "·",
      },
      weekTag: "s{n}",
      useLastStrength: "Usar a semana {week}: {kg} × {reps}, {set}ª série",
      useLastCardio: "Usar a semana {week}: {dist} · {time}, {set}ª série",
      useOlderStrength: "Usar {kg} × {reps} de um bloco anterior, {set}ª série",
      useOlderCardio: "Usar {dist} · {time} de um bloco anterior, {set}ª série",
      previousEmpty: "Sem registro anterior para a {set}ª série",
      gain: {
        kg: "+{n} kg",
        dist: "+{n} km",
        reps: { one: "+{n} rep", other: "+{n} reps" },
      },
      fillSets: "Preencher séries",
      fillSetsAria: "Preencher as séries vazias de {exercise} com os números anteriores",
      addSetAria: "Adicionar série a {exercise}",
      removeSetAria: "Remover série de {exercise}",
      removeSetConfirm:
        "A {set}ª série de “{exercise}” tem dados que serão apagados. Remover mesmo assim?",
      fields: {
        kg: { placeholder: "", aria: "carga da {set}ª série" },
        reps: { placeholder: "", aria: "repetições da {set}ª série" },
        dist: { placeholder: "", aria: "distância da {set}ª série" },
        time: { placeholder: "", aria: "tempo da {set}ª série" },
      },
    },

    day: {
      empty: "Nenhum exercício neste dia ainda.",
      editDay: "Editar este dia",
      clear: "Limpar o registro deste dia",
      lastLogged: "Registrado {when}",
      clearEmpty: "Este dia já está vazio.",
      clearConfirm: {
        one: "Limpar a Semana {week}, {day}? Apaga {n} registro e volta as séries ao padrão. Não dá para desfazer.",
        other:
          "Limpar a Semana {week}, {day}? Apaga {n} registros e volta as séries ao padrão. Não dá para desfazer.",
      },
    },

    exercises: {
      title: "Meus exercícios",
      back: "Voltar",
      manage: "Gerenciar exercícios",
      toolsNote: "Adicione o que não estiver no catálogo.",
      createTitle: "Novo exercício",
      create: "Criar exercício",
      namePlaceholder: "ex.: Empurrar trenó",
      nameAria: "Nome do novo exercício",
      groupAria: "Grupo muscular",
      kindAria: "O que cada série registra",
      kind: {
        strength: "Peso e repetições",
        cardio: "Distância e tempo",
      },
      mine: "Seus exercícios",
      empty: "Nenhum ainda — crie um acima.",
      renameAria: "Renomear {exercise}",
      remove: "Excluir",
      nameRequired: "Dê um nome ao exercício primeiro.",
      removeConfirmUnused: "Excluir “{exercise}”? Nenhum plano usa.",
      removeConfirm: {
        one: "“{exercise}” está em {slots} dia(s) de {plans} plano(s) e tem {n} registro. Excluir também remove esses dados. Não é possível desfazer.",
        other: "“{exercise}” está em {slots} dia(s) de {plans} plano(s) e tem {n} registros. Excluir também remove esses dados. Não é possível desfazer.",
      },
    },
    plans: {
      title: "Planos",
      empty: "Nenhum plano ainda — crie um para começar a registrar.",
      manage: "Gerenciar planos",
      inUse: "Em uso",
      use: "Usar",
      edit: "Editar",
      duplicate: "Duplicar",
      remove: "Excluir",
      create: "Novo plano",
      newName: "Novo plano",
      copyName: "{name} (cópia)",
      untitled: "Plano sem nome",
      planCount: { one: "{n} plano", other: "{n} planos" },
      weekCount: { one: "{n} semana", other: "{n} semanas" },
      dayCount: { one: "{n} dia", other: "{n} dias" },
      recordCount: { one: "{n} registro", other: "{n} registros" },
      noRecords: "sem registros ainda",
      back: "Voltar ao treino",
      removeConfirm: {
        one: "Excluir “{plan}”? Isso também apaga {n} registro. Não dá para desfazer.",
        other: "Excluir “{plan}”? Isso também apaga {n} registros. Não dá para desfazer.",
      },
      removeConfirmEmpty: "Excluir “{plan}”? Não dá para desfazer.",
    },

    planEditor: {
      title: "Editar plano",
      done: "Concluir",
      nameLabel: "Nome do plano",
      namePlaceholder: "ex.: Bloco de hipertrofia",
      weeksLabel: "Semanas",
      addWeekAria: "Adicionar semana",
      removeWeekAria: "Remover semana",
      daysLabel: "Dias",
      addDay: "Adicionar dia",
      dayNamePlaceholder: "ex.: Peito + superiores",
      dayNameAria: "Nome do dia {n}",
      moveUpAria: "Mover {item} para cima",
      moveDownAria: "Mover {item} para baixo",
      removeDayAria: "Remover {item}",
      removeSlotAria: "Remover {item}",
      emptyDay: "Nenhum exercício neste dia ainda.",
      addExercise: "Adicionar exercício",
      filterPlaceholder: "Digite para filtrar a lista",
      filterAria: "Filtrar exercícios",
      noMatches: "Nenhum exercício corresponde.",
      closePicker: "Fechar a lista de exercícios",
      repsLabel: "Reps",
      repsMinAria: "Mínimo de repetições de {exercise}",
      repsMaxAria: "Máximo de repetições de {exercise}",
      dropRecordsConfirm: {
        one: "Esta mudança descarta {n} registro. Continuar?",
        other: "Esta mudança descarta {n} registros. Continuar?",
      },
    },

    catalog: {
      groups: {
        chest: "Peito",
        back: "Costas",
        legs: "Pernas",
        shoulders: "Ombros",
        arms: "Braços",
        core: "Abdômen",
        cardio: "Cardio",
      },
      exercises: {
        "bench-press": "Supino reto (barra ou halteres)",
        "incline-dumbbell-press": "Supino inclinado com halteres",
        "chest-fly": "Crucifixo ou crossover",
        "pull-up": "Barra fixa ou puxada alta",
        "bent-over-row": "Remada curvada (barra/halter)",
        "seated-row": "Remada sentada na polia",
        "back-squat": "Agachamento livre",
        "leg-press": "Leg press",
        "hack-squat": "Hack squat",
        "romanian-deadlift": "Levantamento terra romeno",
        "leg-curl": "Cadeira flexora",
        "leg-extension": "Cadeira extensora",
        "standing-calf-raise": "Panturrilha em pé",
        "seated-calf-raise": "Panturrilha sentado",
        "shoulder-press": "Desenvolvimento com halteres",
        "lateral-raise": "Elevação lateral",
        "face-pull": "Face pull",
        "triceps-pushdown": "Tríceps na polia",
        "barbell-curl": "Rosca direta",
        "hammer-curl": "Rosca martelo",
        abs: "Abdominal (prancha/elevação pernas)",
        "walk-run": "Walk-run (caminhada/corrida)",
      },
    },

    tools: {
      title: "Backup",
      export: "Fazer backup agora",
      import: "Restaurar um backup",
      note: "Restaurar substitui tudo que está neste aparelho.",
      lastBackup: "Último backup: {when}",
      importReplaces: "Restaurar substitui tudo que está neste aparelho.",
      importEmptyDevice: "Este aparelho ainda não tem planos nem registros.",
      importCurrent: "Aqui agora: {plans} e {records}.",
      importFile: "No arquivo: {plans} e {records}.",
      importFileOnly: "O arquivo tem {plans} e {records}.",
      importDate: "Backup feito em {when}.",
      importContinue: "Continuar?",
      importRestore: "Restaurar?",
      importDone: "Progresso importado com sucesso.",
      importInvalid: "Arquivo inválido. Selecione um backup JSON exportado pelo {app}.",
      readError: "Não foi possível ler o arquivo.",
      exportFailed: "Não foi possível compartilhar o backup. Tente de novo.",
    },

    settings: {
      title: "Ajustes",
      language: "Idioma",
    },

    banner: {
      backupTitle: "Faça um backup",
      backupBody: "Tudo fica salvo só neste aparelho. Guarde uma cópia em outro lugar.",
      dismissAria: "Dispensar",
      installTitle: "Instale na tela inicial",
      installBody:
        "Safari → Compartilhar → “Adicionar à Tela de Início”. Abre em tela cheia e protege seus dados.",
    },

    plan: {
      dayFallback: "Dia {n}",
    },
  },
};
