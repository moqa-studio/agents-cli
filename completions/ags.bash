_ags() {
  local cur prev commands
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  commands="scan skill-cost grab rm stats list-agents"

  if [[ ${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${commands}" -- "${cur}") )
    return 0
  fi

  case "${prev}" in
    --agent|--to)
      COMPREPLY=( $(compgen -W "claude cursor codex" -- "${cur}") )
      return 0
      ;;
    --type)
      COMPREPLY=( $(compgen -W "skill command rule agent" -- "${cur}") )
      return 0
      ;;
    --scope)
      COMPREPLY=( $(compgen -W "local global all" -- "${cur}") )
      return 0
      ;;
    --period)
      COMPREPLY=( $(compgen -W "7d 14d 30d 90d 6m 1y week month year all-time" -- "${cur}") )
      return 0
      ;;
  esac

  local cmd="${COMP_WORDS[1]}"
  local opts="--json --help"

  case "${cmd}" in
    scan)       opts="--agent --type --scope --json --help" ;;
    skill-cost) opts="--scope --json --help" ;;
    grab)       opts="--to --dry-run --json --help" ;;
    rm|remove)  opts="--agent --dry-run --json --help" ;;
    stats)      opts="--period --json --help" ;;
  esac

  COMPREPLY=( $(compgen -W "${opts}" -- "${cur}") )
  return 0
}

complete -F _ags ags
