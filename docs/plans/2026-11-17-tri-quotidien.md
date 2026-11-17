# Le tri quotidien des dépôts : plan d'implémentation

> **Pour les agents :** sous-skill requis : superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans, tâche par tâche. Les étapes se cochent (`- [ ]`).

**But :** chaque matin à 8 h, l'usine lit GitHub, trie les PR et issues qui traînent, fait juger les cas douteux par des agents en parallèle, et présente une seule porte à cocher ; rien ne se commente ni ne se ferme sans approbation.

**Architecture :** un second graphe LangGraph, `build_triage_graph`, à côté du graphe du chat. Il réutilise le checkpointer Postgres, l'index des runs, `run_stream`, la porte `interrupt()` et `McpExecutor`. Le pré-tri est du code pur sur des faits lus par l'API GraphQL de GitHub ; les agents LangChain rendent une sortie structurée Pydantic ; l'exécution passe par le serveur MCP officiel de GitHub, derrière la liste blanche.

**Stack :** Python 3.15, FastAPI, LangGraph 1.2.22, LangChain 1.5.0 (`create_agent`, `response_format`), langfuse 5.2.0, httpx, serveur MCP GitHub ; Vue 3 + Nuxt UI 4 pour la porte ; Ansible (dépôt `lab-infra`) pour le timer.

**Spec :** [`docs/adr/0003-le-tri-quotidien-des-depots.md`](../adr/0003-le-tri-quotidien-des-depots.md). L'exécutant lit l'ADR et ce plan.

## Contraintes globales

- Prose, commentaires d'interface et textes vus par la personne : en français. Code, noms, messages de commit : en anglais, Conventional Commits.
- Aucun tiret cadratin ni demi-cadratin, nulle part (code, commentaires, textes).
- Régime A dans ce dépôt : commits directs sur `main`, `lefthook` (pre-commit : prettier, ruff, gitleaks ; pre-push : `verify.sh`). Le rôle Ansible va dans `lab-infra`, régime B : une branche courte et une PR.
- Périmètre : comptes `guillaume-flambard` et `memolabs-dev`. Exclus : `mediterranean-rescue`, `sosmed-carto-recette`, tout dépôt de l'organisation `dataforgoodfr`. Exclusion vérifiée deux fois : au pré-tri et juste avant d'agir.
- Seuils : PR ouverte depuis plus de **2 jours** ; issue sans activité depuis **14 jours** ; brouillon sans commit depuis **14 jours**.
- Actions : commenter, puis fermer. `merge_pull_request` n'entre jamais dans la liste blanche.
- Une issue étiquetée `P0` ou `P1` ne va jamais dans le groupe « évident ».
- Une décision d'agent sans lien de preuve devient `garder`.
- La porte expire en 24 h (`GATE_TIMEOUT_SECONDS`, déjà défini) ; passé ce délai, rien ne part.
- Aucun appel réseau dans les tests : `httpx.MockTransport`, fixtures JSON, faux juge.
- Docs de référence (versions installées) : LangGraph `Send` et `interrupt()` (https://docs.langchain.com/oss/python/langgraph/interrupts), LangChain structured output (https://docs.langchain.com/oss/python/langchain/structured-output), GitHub GraphQL (https://docs.github.com/en/graphql/reference/objects), `Langfuse.create_dataset_item` (lu dans `langfuse/_client/client.py:3615`, upsert par `id`).

## Points de relecture

Cinq cas que l'ADR implique sans qu'un test les couvre spontanément. Chacun a son test dans la tâche indiquée.

1. **L'élément a changé entre le tri et l'approbation** (fermé à la main, nouveau commit). On attend : rien ne part sur un élément qui n'est plus ouvert. Test dans la tâche 5 (`test_already_closed_item_is_skipped`).
2. **Le commentaire d'un agent mentionne quelqu'un** (`@login`), ce qui notifierait un tiers. On attend : les mentions sont neutralisées en code (`` `@login` ``) avant la porte. Test dans la tâche 3 (`test_mentions_are_defused`).
3. **La recherche GitHub renvoie plus de 100 résultats ou `incompleteResults`.** On attend : pagination complète, et un tri partiel le dit dans son résumé. Test dans la tâche 1 (`test_reader_follows_pages_and_flags_incomplete`).
4. **Le timer part deux fois le même jour** (relance manuelle, rattrapage systemd). On attend : un seul run par jour, le second appel reçoit 409. Test dans la tâche 6 (`test_second_triage_same_day_conflicts`).
5. **Le commentaire part mais la fermeture échoue.** On attend : le run le dit pour cet élément (« commenté, non fermé : cause »), les autres continuent. Test dans la tâche 5 (`test_close_failure_after_comment_is_reported`).

---

### Tâche 1 : lire les faits sur GitHub

**Fichiers :**

- Créer : `services/api/usine_api/triage/__init__.py`, `services/api/usine_api/triage/github.py`, `config/triage.yaml`
- Créer : `services/api/tests/fixtures/triage/search_prs.json`, `search_issues.json`
- Test : `services/api/tests/test_triage_github.py`

**Interfaces :**

- Produit :
  - `class TriagePolicy(BaseModel)`: `accounts: list[str]`, `excluded_repos: list[str]` (forme `owner/name`), `excluded_owners: list[str]`, `pr_after_days: int = 2`, `issue_after_days: int = 14`, `draft_after_days: int = 14`; `def excludes(self, repo: str) -> bool`; `def load_policy(path: Path) -> TriagePolicy`.
  - `class Item(BaseModel, frozen=True)`: `repo: str`, `number: int`, `kind: Literal["pr", "issue"]`, `title: str`, `url: str`, `author: str`, `labels: tuple[str, ...]`, `created_at: datetime`, `updated_at: datetime`, `is_draft: bool = False`, `last_commit_at: datetime | None = None`, `ci: Literal["success", "failure", "pending", "none"] = "none"`, `conflicting: bool = False`, `closed_by_merged_pr: str | None = None` (URL de la PR fusionnée qui la cite).
  - `class Snapshot(BaseModel)`: `items: list[Item]`, `incomplete: list[str]` (raisons lisibles : dépôt illisible, résultats incomplets).
  - `class GitHubReader(Protocol)`: `async def stale(self, policy: TriagePolicy, now: datetime) -> Snapshot`; `async def is_open(self, repo: str, number: int) -> bool`.
  - `class GraphQLReader`: `__init__(self, token: str, *, client: httpx.AsyncClient | None = None)`.

- [ ] **Étape 1 : écrire les tests qui échouent**

```python
async def test_reader_builds_items_from_search(mock_github): ...
    # search_prs.json: 3 PR, dont une Dependabot, une en conflit, une brouillon
    snap = await reader.stale(policy, NOW)
    pr = next(i for i in snap.items if i.number == 41)
    assert pr.ci == "failure" and pr.conflicting is True and pr.author == "dependabot"
    issue = next(i for i in snap.items if i.kind == "issue" and i.number == 7)
    assert issue.closed_by_merged_pr == "https://github.com/memolabs-dev/usine/pull/52"

async def test_excluded_repos_never_leave_the_reader(mock_github):
    snap = await reader.stale(policy, NOW)
    assert not any(policy.excludes(i.repo) for i in snap.items)
    assert all(not i.repo.startswith("dataforgoodfr/") for i in snap.items)

async def test_reader_follows_pages_and_flags_incomplete(mock_github_paged):
    snap = await reader.stale(policy, NOW)
    assert len(snap.items) == 130
    assert any("incomplet" in reason for reason in snap.incomplete)

async def test_unreadable_account_does_not_stop_the_read(mock_github_403_on_one_account):
    snap = await reader.stale(policy, NOW)
    assert snap.items  # l'autre compte est lu
    assert any("guillaume-flambard" in reason for reason in snap.incomplete)
```

- [ ] **Étape 2 :** `uv run pytest services/api/tests/test_triage_github.py -v`, attendu : FAIL (module absent).

- [ ] **Étape 3 : implémenter `GraphQLReader`**

Une requête `search` par compte et par genre : `is:open is:pr user:<compte> created:<now-2j>` et `is:open is:issue user:<compte> updated:<now-14j>`, `first: 100`, pagination par `pageInfo.endCursor`, `issueCount` et un drapeau d'incomplétude si GitHub en renvoie un. Champs : `number title url createdAt updatedAt author{login} labels(first:20){nodes{name}} repository{nameWithOwner}` ; pour une PR `isDraft mergeable commits(last:1){nodes{commit{committedDate statusCheckRollup{state}}}}` ; pour une issue `timelineItems(itemTypes:[CROSS_REFERENCED_EVENT], last:20){nodes{... on CrossReferencedEvent{source{... on PullRequest{merged url}}}}}`. Correspondances : `mergeable == "CONFLICTING"` donne `conflicting`, `statusCheckRollup.state` `SUCCESS/FAILURE/ERROR/PENDING/EXPECTED` donne `success/failure/failure/pending/pending`, absent donne `none`. L'auteur `dependabot[bot]` est normalisé en `dependabot`. Vérifier chaque nom de champ contre la référence GraphQL avant d'écrire la requête. `is_open` : une requête `repository{issueOrPullRequest(number:){... on Issue{state} ... on PullRequest{state}}}`.

`config/triage.yaml` porte les comptes, les dépôts et propriétaires exclus, et les trois seuils de la section Contraintes.

- [ ] **Étape 4 :** relancer les tests, attendu : PASS. `uv run ruff check services/api && uv run mypy services/api/usine_api/triage`.

- [ ] **Étape 5 : commit** `feat(triage): read stale PRs and issues from GitHub as plain facts`

---

### Tâche 2 : le pré-tri par règles, sans modèle

**Fichiers :**

- Créer : `services/api/usine_api/triage/rules.py`
- Test : `services/api/tests/test_triage_rules.py`

**Interfaces :**

- Consomme : `Item`, `TriagePolicy` (tâche 1).
- Produit :
  - `Group = Literal["evident", "a_juger", "a_garder"]`
  - `Motif = Literal["resolu", "doublon", "depasse", "abandonne"]`
  - `class Ruling(BaseModel, frozen=True)`: `item: Item`, `group: Group`, `by: Literal["rule", "agent"] = "rule"`, `motif: Motif | None = None`, `proof: str | None = None`, `comment: str | None = None`. Un `Ruling` du groupe `evident` est une proposition de fermeture ; `by` dit qui l'a faite, et la porte montre les règles d'abord.
  - `def pretriage(items: list[Item], policy: TriagePolicy, now: datetime) -> list[Ruling]`

- [ ] **Étape 1 : écrire les tests qui échouent**

```python
def test_superseded_dependabot_pr_is_evident():
    old = pr("memolabs-dev/usine", 10, "Bump vite from 6.0.1 to 6.0.2", author="dependabot", created=D(-9))
    new = pr("memolabs-dev/usine", 14, "Bump vite from 6.0.1 to 6.1.0", author="dependabot", created=D(-3))
    r = by_number(pretriage([old, new], POLICY, NOW))
    assert r[10].group == "evident" and r[10].motif == "depasse" and r[10].proof == new.url
    assert r[14].group == "a_juger"

def test_issue_cited_by_merged_pr_is_evident():
    r = pretriage([issue(7, closed_by_merged_pr=MERGED)], POLICY, NOW)[0]
    assert (r.group, r.motif, r.proof) == ("evident", "resolu", MERGED)

def test_p0_and_p1_never_evident():
    for label in ("P0", "P1"):
        r = pretriage([issue(7, labels=(label,), closed_by_merged_pr=MERGED)], POLICY, NOW)[0]
        assert r.group == "a_juger"

def test_old_draft_without_commit_goes_to_agents():
    r = pretriage([pr("o/r", 3, "wip", is_draft=True, last_commit_at=D(-20))], POLICY, NOW)[0]
    assert r.group == "a_juger"

def test_excluded_repo_is_dropped_even_if_reader_let_it_through():
    assert pretriage([issue(1, repo="dataforgoodfr/x")], POLICY, NOW) == []

def test_evident_comment_names_the_proof():
    r = pretriage([issue(7, closed_by_merged_pr=MERGED)], POLICY, NOW)[0]
    assert MERGED in (r.comment or "")
```

- [ ] **Étape 2 :** `uv run pytest services/api/tests/test_triage_rules.py -v`, attendu : FAIL.

- [ ] **Étape 3 : implémenter `pretriage`**

Le paquet Dependabot se lit dans le titre par `^Bump (\S+) from \S+ to \S+`, plus `in /chemin` s'il est présent (deux dossiers, deux paquets distincts). Les PR d'un même `(repo, paquet)` se classent par `created_at` ; seule la plus récente reste à juger. Tout élément qui a passé un seuil et n'est pas évident va à `a_juger` ; le reste à `a_garder`. Textes fixes des commentaires évidents :

- dépassé : `Fermée par le tri quotidien de l'usine : remplacée par {proof}.`
- résolu : `Fermée par le tri quotidien de l'usine : résolue par {proof}.`

- [ ] **Étape 4 :** tests PASS, ruff, mypy.
- [ ] **Étape 5 : commit** `feat(triage): rule-based pre-triage, P0 and P1 always go to agents`

---

### Tâche 3 : le verdict des agents, structuré et prudent

**Fichiers :**

- Créer : `services/api/usine_api/triage/judge.py`
- Test : `services/api/tests/test_triage_judge.py`

**Interfaces :**

- Consomme : `Item`, `Ruling`, `Motif` (tâches 1 et 2) ; `Registry`, `toolbox` (`mcp_registry.py`, `mcp_tools.py`) ; `chat_model`, `ModelSettings` (`models.py`).
- Produit :
  - `class TriageVerdict(BaseModel)`: `number: int`, `decision: Literal["fermer", "relancer", "garder"]`, `motif: Motif | None = None`, `proof: str | None = None` (URL `https://github.com/...`), `comment: str = ""`.
  - `class RepoVerdicts(BaseModel)`: `verdicts: list[TriageVerdict]`.
  - `def settle(item: Item, verdict: TriageVerdict | None) -> Ruling` : la règle de prudence, en code.
  - `class Judge(Protocol)`: `async def judge(self, repo: str, items: list[Item]) -> RepoVerdicts`.
  - `class LangChainJudge`: `__init__(self, settings: ModelSettings, *, registry: Registry, transport: Transport, http_client: httpx.AsyncClient | None = None, agent_factory: Callable[..., Any] = create_agent)`.

- [ ] **Étape 1 : écrire les tests qui échouent**

```python
def test_verdict_without_proof_becomes_keep():
    r = settle(ITEM, TriageVerdict(number=ITEM.number, decision="fermer", motif="abandonne", comment="x"))
    assert r.group == "a_garder"

def test_verdict_with_non_github_proof_becomes_keep():
    v = TriageVerdict(number=ITEM.number, decision="fermer", motif="doublon", proof="https://exemple.test/1", comment="x")
    assert settle(ITEM, v).group == "a_garder"

def test_missing_verdict_becomes_keep():
    assert settle(ITEM, None).group == "a_garder"

def test_close_with_proof_is_proposed():
    r = settle(ITEM, CLOSE_WITH_PROOF)
    assert (r.group, r.by, r.motif, r.proof) == ("evident", "agent", "doublon", CLOSE_WITH_PROOF.proof)

def test_mentions_are_defused():
    v = CLOSE_WITH_PROOF.model_copy(update={"comment": "Voir avec @alice"})
    assert settle(ITEM, v).comment == "Voir avec `@alice`"

async def test_judge_gets_read_tools_only():
    seen = {}
    judge = LangChainJudge(SETTINGS, registry=REGISTRY, transport=FAKE, agent_factory=capture(seen))
    await judge.judge("memolabs-dev/usine", [ITEM])
    assert {t.name for t in seen["tools"]} <= {"github__issue_read", "github__pull_request_read", "github__search_issues", "github__get_file_contents"}
    assert seen["response_format"] is RepoVerdicts
```

`relancer` ne ferme rien : `settle` le range en `a_garder`, avec son commentaire gardé pour le résumé du run (pas d'action à la porte dans cette version, l'ADR ne permet que commenter puis fermer).

- [ ] **Étape 2 :** tests FAIL.
- [ ] **Étape 3 : implémenter**

`settle` rend `group="evident"` pour un `fermer` dont la preuve commence par `https://github.com/`, avec un motif et un commentaire non vide ; tout le reste rend `a_garder`. Mentions : `re.sub(r"(?<![`\w])@([\w-]+)", r"`@\1`", comment)`. `LangChainJudge.judge`ouvre la`toolbox`et ne garde que les outils dont le risque est`read`, puis `agent_factory(model, tools, system_prompt=INSTRUCTIONS, response_format=RepoVerdicts)`et lit`result["structured_response"]`. La consigne dit : un élément par verdict, `garder` dans le doute, une preuve est une URL GitHub que l'agent a lue.

- [ ] **Étape 4 :** tests PASS, ruff, mypy.
- [ ] **Étape 5 : commit** `feat(triage): agents return a validated verdict, no proof means keep`

---

### Tâche 4 : la porte à cocher dans le contrat

**Fichiers :**

- Modifier : `services/api/usine_api/contracts/action.py`
- Modifier : `services/api/openapi.json` (régénéré, comparé par `test_runs_api.py`)
- Test : `services/api/tests/test_gate.py`

**Interfaces :**

- Produit :
  - `GateRequest.checklist: bool = False`
  - `GateDecision.selected: list[int] | None = None` : indices des actions approuvées ; seulement avec `decision="approve"` ; sans doublon ; `None` veut dire toutes.

- [ ] **Étape 1 : tests qui échouent**

```python
def test_selected_only_with_approve():
    with pytest.raises(ValidationError):
        GateDecision(decision="reject", reason="non", selected=[0])

def test_selected_has_no_duplicates():
    with pytest.raises(ValidationError):
        GateDecision(decision="approve", selected=[1, 1])

def test_existing_gate_payloads_still_validate():
    GateDecision(decision="approve")  # le chat garde son comportement
```

- [ ] **Étape 2 :** FAIL. **Étape 3 :** ajouter les champs et la règle dans `_complete`. **Étape 4 :** PASS, régénérer `openapi.json` par la commande que `test_runs_api.py` indique, tests du dossier verts.
- [ ] **Étape 5 : commit** `feat(gate): a checklist gate approves a selection`

---

### Tâche 5 : le graphe du tri et son exécution

**Fichiers :**

- Créer : `services/api/usine_api/graph/triage.py`, `services/api/usine_api/triage/execute.py`
- Modifier : `config/mcp-servers.yaml`
- Test : `services/api/tests/test_triage_graph.py`, `services/api/tests/test_triage_execute.py`, `services/api/tests/test_mcp_registry.py`

**Interfaces :**

- Consomme : `GitHubReader`, `Snapshot` (1) ; `pretriage`, `Ruling` (2) ; `Judge`, `settle` (3) ; `GateRequest.checklist`, `GateDecision.selected` (4) ; `HUMAN_GATE`, `SYNTHESIZE` (`graph/supervisor.py`) ; `McpExecutor` (`mcp_tools.py:252`).
- Produit :
  - `def to_action(r: Ruling) -> ProposedAction` : `kind="external_write"`, `target="github/triage"`, `justification="{repo}#{n} « {title} » : {motif}, preuve {proof}"`, `preview=json.dumps({"repo","number","kind","comment","state_reason"})` (`state_reason` : `completed` pour `resolu`, `not_planned` sinon).
  - `class TriageExecutor`: `__init__(self, mcp: McpExecutor, reader: GitHubReader, policy: TriagePolicy)`; `async def execute(self, action: ProposedAction) -> str`.
  - `def build_triage_graph(reader: GitHubReader, judge: Judge, executor: TriageExecutor, policy: TriagePolicy, *, checkpointer: Any = None, clock: Callable[[], datetime] = now_utc) -> CompiledStateGraph`
  - Nœuds : `pretriage`, `judge` (un `Send` par dépôt qui a des cas `a_juger`), `HUMAN_GATE`, `act`, `SYNTHESIZE` (le résumé en français, que `run_stream` lit comme réponse).

- [ ] **Étape 1 : tests qui échouent**

Graphe, avec un faux lecteur, un faux juge et un faux exécuteur qui note ses appels :

```python
async def test_nothing_runs_without_approval(): ...  # état au repos sur interrupt(), exécuteur jamais appelé
async def test_unchecked_item_is_not_executed():      # resume selected=[0] sur 2 actions : 1 appel
async def test_reject_executes_nothing():
async def test_excluded_repo_in_gate_state_is_refused_at_act():  # action forgée dans l'état : refusée, notée
async def test_judge_failure_on_one_repo_keeps_the_run():  # un dépôt lève : ses éléments « gardés », le résumé le dit
async def test_no_proposal_means_no_gate():            # le run finit avec « Rien à fermer aujourd'hui. »
async def test_gate_is_a_checklist():                  # interrupt value: checklist is True, évidents d'abord
async def test_summary_reports_incomplete_read():      # Snapshot.incomplete apparaît dans la réponse
```

Exécuteur, avec un faux `McpExecutor` :

```python
async def test_comment_then_close_issue():
    # appels : github/add_issue_comment {owner, repo, issue_number, body}
    #          github/issue_write {method: "update", owner, repo, issue_number, state: "closed", state_reason}
async def test_comment_then_close_pr():
    # github/update_pull_request {owner, repo, pullNumber, state: "closed"}
async def test_already_closed_item_is_skipped():         # reader.is_open False : aucun appel, « déjà fermé »
async def test_close_failure_after_comment_is_reported(): # « commenté, non fermé : échec : ... »
async def test_comment_failure_stops_the_close():         # pas de fermeture sans commentaire
```

Liste blanche :

```python
def test_merge_pull_request_is_refused(): ...  # Registry.resolve("github").risk_of("merge_pull_request") lève RegistryRefusal
def test_comment_and_pr_update_are_irreversible(): ...
```

- [ ] **Étape 2 :** FAIL.

- [ ] **Étape 3 : implémenter**

`config/mcp-servers.yaml` gagne `add_issue_comment: irreversible`, `update_pull_request: irreversible`, `pull_request_read: read`. Les noms et paramètres (`issue_number`, `pullNumber`, `state`, `state_reason`) se vérifient dans le README de `github/github-mcp-server` avant d'écrire, et le commentaire du fichier dit que le PAT a maintenant Issues et Pull requests en écriture.

`TriageExecutor.execute` relit `policy.excludes(repo)` puis `reader.is_open`, construit deux `ProposedAction` (cible `github/add_issue_comment`, puis l'outil de fermeture) et les passe à `McpExecutor.execute`, qui garde ses refus (outil non irréversible, JSON invalide). Un résultat qui ne commence pas par `exécutée` arrête l'élément.

Le graphe suit la forme de `supervisor.py` : un `TypedDict` d'état (`snapshot`, `rulings` avec réducteur d'addition, `proposed`, `decision`, `executed`), `interrupt(GateRequest(actions=..., checklist=True).model_dump(mode="json"))`, et un `act` qui ne lit que `selected` (ou toutes si `None`) et seulement après `approve`. La porte n'est pas ouverte s'il n'y a aucune action.

- [ ] **Étape 4 :** PASS, ruff, mypy.
- [ ] **Étape 5 : commit** `feat(triage): the triage graph, one checklist gate, comment then close`

---

### Tâche 6 : la route, le jeton de service et les évaluations

**Fichiers :**

- Modifier : `services/api/usine_api/app.py`, `services/api/usine_api/atelier.py`, `services/api/usine_api/mcp_auth.py`, `services/api/usine_api/observability.py`, `services/api/openapi.json`
- Test : `services/api/tests/test_triage_api.py`, `services/api/tests/test_observability.py`

**Interfaces :**

- Consomme : `build_triage_graph` (5) ; `run_stream` (`chat_stream.py:123`) ; `McpToken`, `Scope` (`mcp_auth.py`).
- Produit :
  - `Scope = Literal["read", "read_fork", "triage"]` ; `BEARER_ROUTES["triage"] = (("POST", re.compile(r"/api/triage")),)`.
  - `POST /api/triage` : jeton de portée `triage` seulement ; crée le run `tri-AAAA-MM-JJ` (date de Paris) au nom de l'org du jeton ; 202 avec `{"threadId": ...}` ; le flux se vide dans une tâche de fond gardée dans `app.state` ; 409 si le run du jour existe.
  - `graph_for(thread_id) -> Any` : `triage_graph` pour un id `tri-`, sinon `chat_graph` ; utilisé par `pending_gate`, `open_thread`, `decide_gate`, `resume_thread`.
  - `decide_gate` accepte `selected` seulement pour une porte `checklist` et refuse (422) un indice hors limites.
  - `def record_triage_decisions(thread_id: str, actions: list[dict], decision: dict) -> None` : une ligne par action dans le jeu Langfuse `usine-tri`, `id=f"{thread_id}:{index}"`, `input` = l'action, `expected_output={"approved": bool}`. Ne casse jamais un run.

- [ ] **Étape 1 : tests qui échouent**

```python
def test_triage_needs_the_triage_scope(client, read_token): assert post_triage(read_token).status_code == 401
def test_session_cannot_start_triage(logged_client): assert logged_client.post("/api/triage").status_code == 401
def test_triage_token_opens_nothing_else(client, triage_token): assert get("/api/runs", triage_token).status_code == 401
def test_triage_run_belongs_to_token_org(...): ...
def test_second_triage_same_day_conflicts(...): assert second.status_code == 409
def test_selected_out_of_range_is_refused(...): assert r.status_code == 422
def test_selected_on_chat_gate_is_refused(...): assert r.status_code == 422
def test_gate_decision_feeds_the_dataset(fake_langfuse): # 3 actions, selected=[0, 2]
    assert [i["expected_output"] for i in fake_langfuse.items] == [{"approved": True}, {"approved": False}, {"approved": True}]
```

- [ ] **Étape 2 :** FAIL. **Étape 3 :** implémenter ; le graphe du tri se construit dans `lifespan` avec le même checkpointer, le `LangChainJudge`, et un `GraphQLReader` lu depuis `USINE_GITHUB_TOKEN`. Sans jeton, `triage_graph` vaut `None` et la route répond 503 « Tri indisponible : jeton GitHub absent ». `record_triage_decisions` est appelé à côté de `record_gate_decision`, pour un run `tri-` seulement.
- [ ] **Étape 4 :** PASS ; `openapi.json` régénéré ; suite API complète verte.
- [ ] **Étape 5 : commit** `feat(triage): service-token route, one run a day, gate decisions as a Langfuse dataset`

---

### Tâche 7 : la porte à cocher dans l'atelier

**Fichiers :**

- Modifier : `apps/web/src/components/GatePanel.vue` et son type `GateView`
- Test : `apps/web/src/components/__tests__/GatePanel.spec.ts` (créer s'il n'existe pas, sur le modèle des tests Vitest du dossier)

**Interfaces :**

- Consomme : `GateRequest.checklist`, `GateDecision.selected` (4).
- Produit : pour `gate.checklist === true`, une case par action, cochée au départ ; chaque ligne montre le dépôt et le numéro en lien, le titre, le motif, le lien de preuve, et le commentaire exact ; un bouton « Approuver la sélection (n) » qui émet `{ decision: 'approve', selected }` ; « Tout rejeter » demande un motif. Une porte sans `checklist` garde l'écran actuel.

- [ ] **Étape 1 : tests qui échouent**

```ts
it('checks every action by default and counts them', ...)    // bouton « Approuver la sélection (3) »
it('emits only the checked indices', ...)                    // décoche la 2e : selected [0, 2]
it('disables approve when nothing is checked', ...)
it('keeps the classic gate when checklist is absent', ...)
```

- [ ] **Étape 2 :** `pnpm --filter web test GatePanel`, FAIL. **Étape 3 :** implémenter avec `UCheckbox` de Nuxt UI 4 (doc de la version installée), statuts en mots, aucune pastille ; les règles de `apps/web/DESIGN.md` et la grille `micro-motion` (appui à 0,97, survol sous `(hover: hover) and (pointer: fine)`) s'appliquent. **Étape 4 :** PASS, `pnpm --filter web typecheck`, puis vérification dans le navigateur sur un run local `tri-` (largeur 400 px et bureau).
- [ ] **Étape 5 : commit** `feat(web): the checklist gate for the daily triage`

---

### Tâche 8 : mise en service

Trois actions ici ne sont pas du code de l'usine. Elles se font dans cet ordre, et la tâche n'est finie que quand le premier tri réel attend à la porte.

**8a. Le jeton GitHub (Guillaume).** Créer un PAT à grain fin sur les deux comptes, dépôts choisis (hors dépôts exclus), avec Issues et Pull requests en écriture, Contents en lecture. Le poser comme `USINE_GITHUB_TOKEN` dans le `.env` du service sur le VPS. L'agent ne crée pas de jeton.

**8b. L'essai réel de `update_pull_request`.** Sur un dépôt de test jetable (`guillaume-flambard/usine-tri-essai`, créé puis archivé), ouvrir une PR, l'approuver dans l'atelier, et noter dans l'ADR la valeur de `state` acceptée et la réponse obtenue. Si `closed` est refusé, corriger `TriageExecutor` et son test avant d'aller plus loin. Critère d'acceptation de l'ADR, bloquant.

**8c. Le timer (dépôt `lab-infra`, régime B : branche et PR).**

- Rôle `usine-triage` sur le modèle de `roles/visit-watch` : un service `oneshot` qui fait `curl -fsS -X POST -H "Authorization: Bearer $TOKEN" https://usine.memolabs.dev/api/triage`, un timer `OnCalendar=*-*-* 08:00:00 Europe/Paris`, `Persistent=true`. Le jeton (portée `triage`, émis dans l'atelier pour l'org de Guillaume) vit dans un fichier d'environnement du VPS, mode 0600, jamais dans le dépôt.
- Vérifier : `systemctl list-timers usine-triage.timer` montre le prochain passage ; `systemctl start usine-triage.service` crée le run du jour ; un second départ reçoit 409.

**8d. La ligne de LIVE-STATE (Mac).** Dans `~/.agent/refresh-live-state.sh`, lire `GET https://usine.memolabs.dev/api/runs/tri-<date du jour>` avec un jeton de portée `read` gardé dans le trousseau macOS, et écrire `Tri du jour : N propositions, à valider (<lien>)`, ou `Tri du jour : rien à valider`, ou `Tri du jour : absent` si le run n'existe pas. Un échec de lecture écrit `Tri du jour : illisible` et ne casse pas le reste du relevé.

- [ ] **Vérification finale :** le lendemain à 8 h, le run `tri-` existe, la porte liste des propositions, chacune avec une preuve ; une approbation partielle commente puis ferme les éléments cochés seulement ; la décision apparaît dans le jeu `usine-tri` de Langfuse ; LIVE-STATE porte la ligne. Le rapport de recette, daté, va dans le ticket Linear.
