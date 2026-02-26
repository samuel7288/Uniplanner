# UniPlanner Import Template

Use these CSV files to send your data for bulk import.

## General rules

- Encoding: UTF-8
- Separator: comma `,`
- Keep header row exactly as provided.
- Date time format: `YYYY-MM-DD HH:mm`
- `course_code` must match a row in `materias.csv`
- `project_name` must match a row in `proyectos.csv`

## Allowed enum values

- `modality`: `PRESENTIAL` | `ONLINE`
- `priority`: `LOW` | `MEDIUM` | `HIGH`
- `status` (tareas): `PENDING` | `IN_PROGRESS` | `DONE`
- `repeat_rule`: `NONE` | `WEEKLY` | `MONTHLY`
- `type` (examenes): `QUIZ` | `MIDTERM` | `FINAL` | `OTHER`
- `status` (proyectos/tareas de proyecto): `TODO` | `DOING` | `DONE`
- `completed` (milestones): `true` | `false`

## Files

- `materias.csv`
- `horarios.csv`
- `tareas.csv`
- `examenes.csv`
- `proyectos.csv`
- `milestones.csv`
- `project_tasks.csv`
- `notas.csv`

## Notes

- `tags` and `attachment_links` use comma-separated values inside the same field.
- `reminder_offsets` is minutes before exam, comma-separated (example: `10080,4320,1440,360,60`).
- If a value is optional and you do not have it, leave it empty.
