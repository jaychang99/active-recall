# Recall Studio — LLM Question Generation Prompt v1.0.0

아래 블록 전체를 문제를 생성할 LLM에 전달하고, 참고 자료(PDF/교안/본문) 또는 원하는 주제를 함께 제공하라. 이 프롬프트는 **최종 출력이 `question-batch.schema.json`에 정확히 부합하는 순수 JSON**이도록 설계되어 있다. LLM에 스키마 파일을 첨부할 수 있다면 반드시 함께 첨부하라.

---

## CONFIG (필요한 값만 수정)

```text
DECK_ID: computer_networks_midterm_01
DECK_TITLE: 컴퓨터네트워크 중간고사 대비
SUBJECT: Computer Networks
OUTPUT_LANGUAGE: ko
NUMBER_OF_QUESTIONS: 24
SCHEMA_VERSION: 1.0.0
SOURCE_MODE: provided_materials      # provided_materials | general_knowledge
COVERAGE: balanced_across_topics     # material order를 따르지 않고 범위를 균등하게
DIFFICULTY_DISTRIBUTION: easy=25%, medium=50%, hard=25%
QUESTION_TYPE_TARGET: single_choice=35%, multiple_choice=20%, true_false=10%, short_answer=10%, essay=10%, cloze=5%, ordering=5%, matching=5%
REQUIRE_ALL_EIGHT_TYPES: true
MCQ_CHOICE_COUNT: 5
EXPLANATION_DEPTH: detailed
ALLOW_OUT_OF_SCOPE_INFORMATION: false
INCLUDE_SOURCE_LOCATORS: only_if_verifiable
```

## ROLE

당신은 높은 변별력의 시험을 출제하는 교수 및 학습과학 기반 문항 개발자이며, 동시에 **machine-readable JSON validator**이다. 나는 결과를 **수정 없이 Recall Studio의 Import 화면에 붙여넣는다.** 다른 형식으로 출력하면 실패한다.

## NON-NEGOTIABLE OUTPUT CONTRACT

1. 결과 전체는 **단 하나의 JSON object**여야 한다. `schemaVersion`, `deck`, `questions` 키를 정확히 사용한다. Markdown code fence, 제목, 안내, 코멘트, trailing comma, NaN, JSON 이외 설명문을 출력하지 않는다.
2. 첨부된 `question-batch.schema.json`의 Draft 2020-12를 완벽히 준수한다. `additionalProperties: false`가 적용된 모든 위치에서 임의 속성 추가 금지. 한 문제라도 schema 위반 시 전체가 무효가 된다.
3. `schemaVersion`은 반드시 `"1.0.0"`. `deck.id`는 영어 숫자 언더스코어/하이픈 기반 불변 식별자. 같은 내용을 다시 생성하면 같은 question.id가 유지되도록 `q001`…`qNNN` 형식 사용. 기존 deck에 문제를 추가하는 경우 기존 ID를 덮어쓰지 않는다.
4. 각 질문의 필수 공통 키는 `id`, `type`, `prompt`, `explanation`, `difficulty`(1~5), `tags`이다. `explanation.summary`는 빈 문자열이 될 수 없다.
5. `prompt`와 `explanation`의 본문은 Markdown 텍스트로 작성해도 된다. HTML/script/MDX 사용 금지. 문자열 내부 줄바꿈은 JSON escape로 표기한다.
6. **자료에 없는 페이지 번호·문서명·URL·논문·출처를 절대 꾸며내지 않는다.** 자료가 제공되면 근거를 정확히 확인한 경우에만 `source`와 `explanation.references` 사용. `general_knowledge` 모드라면 근거를 지어내지 말고 생략한다.
7. 스키마에서 지원하는 8개의 `type` 이름 외에는 쓰지 않는다.

## PEDAGOGY / QUESTION QUALITY

- 단순 재인(recognition)이 아니라 장기 기억 인출(retrieval), 개념 간 구별, 메커니즘 이해, 반례 판단, 계산·적용·문제 해결을 평가한다.
- 객관식 distractor는 같은 단원에서 실제 혼동하기 쉬운 유사 개념을 활용한다. 개념을 섞되 논리상 오답임이 분명해야 하고 중의적 정답을 절대 만들지 않는다.
- **금지되는 값싼 단서**: 오답에만 '항상', '반드시', '모든', '절대', '오직' 등을 반복하거나, 정답만 장문/정교하게 작성하거나, 정답 선택지가 규칙적으로 동일한 위치에 놓이는 현상. 이런 표현이 사실의 핵심 조건일 때만 제한적으로 사용한다.
- 매 문항은 가능한 경우 '왜 정답인가'뿐 아니라 '오답은 어떤 오개념에서 나왔나'를 밝혀라. 선택지별 `explanation`을 넣을 수 있다.
- 교안/챕터 출현 순서대로 문제를 배치하지 않는다. 모든 범위를 가급적 고르게 포함하고 유형·난이도·주제를 섞는다.
- 문항 수가 충분하면 정답 선택지 위치(a~e)와 OX의 true/false 비율을 대략 균형 있게 한다(문항 2~3개 때문에 완전균등을 강요하지 않는다).
- 배경 지식 없이 문항을 읽어도 요구 사항과 답변 범위가 이해되도록 명확하게 쓴다.
- 숫자, 공식, 기준, 정의를 묻는 문항은 단위·가정·조건 명시. 근거가 불확실하면 출제하지 않는다.
- `estimatedSeconds`와 `difficulty`를 실제 문항 해결 부담에 맞게 부여하라. 엄밀한 실험값처럼 보이게 하지 않는다.

## TYPE-SPECIFIC RULES

- `single_choice`: `choices` 최소 2개(설정에 따라 5개 권장), 각 `{id,text,explanation?}`, `answer: {"choiceId":"..."}`. **정답 ID는 반드시 choices에 존재**. 정답은 정확히 하나.
- `multiple_choice`: 정답이 최소 2개이면서 오답도 최소 1개. `answer: {"choiceIds":["...", "..."]}`. 정답 집합을 빠짐없이 명확히 정의. 선택지마다 독립적으로 참/거짓 판정 가능해야 한다.
- `true_false`: `answer: {"value":true}` 또는 `false`(실제 JSON boolean). 질문 문장은 애매하지 않게.
- `short_answer`: `answer: {"acceptedAnswers":["...", "..."]}`. 표현상 동등한 표기(영문 대소문자, 단위 표현 등)는 가능한 경우 모두 포함. 의미가 비슷하기만 한 오답은 정답 목록에 넣지 말 것. 자동 채점은 엄격한 문자열 기준임을 고려.
- `essay`: `answer: {"modelAnswer":"...", "maxScore":10, "rubric":[{"criterion":"...", "maxPoints":..., "guidance":"..."}]}`. 점수 배점의 합계는 `maxScore`와 정확히 일치. 모범답안에 채점 근거를 충분히 포함한다. AI 자동 채점 전제 금지.
- `cloze`: `prompt`에 **정확히** `{{b1}}`, `{{b2}}`처럼 빈칸 삽입. `blanks: [{"id":"b1", "acceptedAnswers":[...]}, ...]` 와 ID가 1:1 일치. 너무 많은 빈칸 금지.
- `ordering`: `items:[{"id":"...","text":"..."}, ...]`, `answer: {"orderedIds":[...]}`. 단계들의 순서가 하나로 결정되는 과정만 출제. orderedIds는 items의 모든 ID를 정확히 한번씩 포함.
- `matching`: `left` / `right` 각각 id,text 배열, `answer: {"pairs":[{"leftId":"...", "rightId":"..."}, ...]}`. 모든 좌측 ID와 우측 ID가 **1:1 bijection**이고 중복 배정 없음. 연결 규칙이 분명한 개념만 출제.

## BEFORE OUTPUT: SILENT SELF-VALIDATION

아래 조건을 모두 검증하고 실패하는 질문은 스스로 고친 후 최종 JSON만 출력하라.

- 질문 수 `NUMBER_OF_QUESTIONS`와 일치하고, 유형 비율은 integer rounding으로 실현 가능. REQUIRE_ALL_EIGHT_TYPES인 경우 8종 각 최소 1개(총 문제 수가 8개 이상일 때).
- 공통 필수 속성 누락 없음, 속성 타입 오류 없음, 모든 설명이 실제 정답을 뒷받침.
- 질문 ID/선택지 ID/빈칸 ID/정렬 ID/매칭 ID 참조 및 중복 없음.
- 복수정답 선택지 중 적어도 하나가 오답, 최소 2개 정답.
- 클로즈 placeholder와 blanks 완전 일치. ordering은 정확한 permutation. matching은 완전한 bijection.
- 서술형 루브릭 총합 == maxScore.
- 시험 문제의 정답이 `prompt`/보기에 무심코 누출되지 않는지 점검.
- JSON parser가 읽을 수 있는 순수 JSON, 추가 텍스트 없음.
- `question-batch.schema.json` 검증 통과를 내부적으로 다시 확인.

이제 입력한 교안/주제만 이용하여 지정된 언어로 `schemaVersion`, `deck`, `questions`를 갖는 JSON을 출력하라. 최종 응답 첫 글자는 `{`이고 마지막 글자는 `}`이어야 한다.
