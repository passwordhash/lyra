# Трекер задач: GitHub

Issues и спеки этого репозитория живут как GitHub issues. Для всех операций используй `gh` CLI.

## Конвенции

- **Создать issue**: `gh issue create --title "..." --body "..."`. Для многострочных тел используй heredoc.
- **Прочитать issue**: `gh issue view <number> --comments`, фильтруя комментарии через `jq`, и также получая метки.
- **Список issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` с нужными фильтрами `--label` и `--state`.
- **Прокомментировать issue**: `gh issue comment <number> --body "..."`
- **Поставить / снять метку**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Закрыть**: `gh issue close <number> --comment "..."`

Репозиторий определяется из `git remote -v`; `gh` делает это автоматически внутри клона.

## Pull request'ы как поверхность триажа

**PR'ы как источник запросов: нет.** _(Поставь `yes`, если репозиторий считает внешние PR фича-реквестами; `/triage` читает этот флаг.)_

Когда стоит `yes`, PR проходят те же метки и состояния, что и issues, через `gh pr`-эквиваленты:

- **Прочитать PR**: `gh pr view <number> --comments` и `gh pr diff <number>` для диффа.
- **Список внешних PR для триажа**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`, оставляем только `authorAssociation` из `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR` или `NONE` (отбрасываем `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Комментарий / метки / закрытие**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub использует единое пространство номеров для issues и PR, поэтому `#42` может оказаться любым из них: разрешай через `gh pr view 42` с фолбэком на `gh issue view 42`.

## Когда скилл говорит «опубликуй в трекер»

Создай GitHub issue.

## Когда скилл говорит «получи тикет»

Выполни `gh issue view <number> --comments`.

## Операции wayfinding

Используется `/wayfinder`. **Карта** — один issue с **дочерними** issues в качестве тикетов.

- **Карта**: один issue с меткой `wayfinder:map`, в теле — Notes / Decisions-so-far / Fog. `gh issue create --label wayfinder:map`.
- **Дочерний тикет**: issue, привязанный к карте как GitHub sub-issue (`gh api` к sub-issues endpoint). Если sub-issues недоступны — добавь дочерний в task list в теле карты и поставь `Part of #<map>` вверху тела дочернего. Метки: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). После claim тикет назначается ведущему разработчику.
- **Блокировки**: **нативные issue dependencies** GitHub — каноничное, видимое в UI представление. Добавь ребро: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, где `<blocker-db-id>` — числовой **database id** блокера (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, не `#number` и не `node_id`). GitHub отдаёт `issue_dependencies_summary.blocked_by` (только открытые блокеры — живой гейт). Если dependencies недоступны — фолбэк: строка `Blocked by: #<n>, #<n>` вверху тела дочернего. Тикет разблокирован, когда закрыт каждый блокер.
- **Запрос фронтира**: список открытых детей карты (`gh issue list --state open`, в скоупе sub-issues / task list карты), отбросить имеющих открытый блокер (`issue_dependencies_summary.blocked_by > 0` или открытый issue в строке `Blocked by`) или assignee; первый в порядке карты побеждает.
- **Claim**: `gh issue edit <n> --add-assignee @me` — первая запись сессии.
- **Resolve**: `gh issue comment <n> --body "<ответ>"`, затем `gh issue close <n>`, затем дописать указатель на контекст (gist + ссылка) в Decisions-so-far карты.
