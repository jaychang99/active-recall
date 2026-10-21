/**
 * Metadata that drives the generic data manager (API + web). One entry per entity.
 * `fields` are what the UI may show/filter/edit; Prisma delegates are looked up by `model`.
 * `userId` is deliberately absent from every field list: the service forces it on every query and write.
 */
export type FieldType = 'string' | 'text' | 'number' | 'boolean' | 'datetime' | 'json' | 'enum';

export interface FieldMeta {
  name: string;
  label: string;
  type: FieldType;
  /** editable through PATCH / bulk patch */
  editable?: boolean;
  /** required on create */
  required?: boolean;
  /** usable as a filter (equals / contains / range) */
  filterable?: boolean;
  /** text search target (contains) */
  searchable?: boolean;
  sortable?: boolean;
  enumValues?: string[];
  /** relation hint for the UI (links to another entity) */
  ref?: string;
  /** hidden in the table but visible in the detail form */
  wide?: boolean;
}

export interface EntityMeta {
  key: string;
  model: string; // prisma delegate name
  label: string;
  pk: string;
  softDelete: boolean;
  creatable: boolean;
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  fields: FieldMeta[];
  /** relations to include for display (select of a few scalar fields) */
  display?: Record<string, { select: Record<string, true> }>;
}

const stamps: FieldMeta[] = [
  { name: 'createdAt', label: '생성', type: 'datetime', filterable: true, sortable: true },
  { name: 'updatedAt', label: '수정', type: 'datetime', filterable: true, sortable: true },
  { name: 'deletedAt', label: '삭제', type: 'datetime', filterable: true, sortable: true },
];

const QUESTION_TYPES = ['single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay', 'cloze', 'ordering', 'matching', 'numeric', 'cloze_select', 'statement_set', 'categorize', 'two_tier', 'recall_card', 'stepwise', 'highlight', 'cloze_bank', 'code_cloze', 'matrix', 'numeric_grid', 'list_answer', 'image_hotspot', 'parsons', 'find_and_fix', 'coordinate_point', 'regex_answer'];
const CARD_STATUS = ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING'];
const SESSION_MODES = ['study', 'cram', 'practice', 'exam'];

export const ENTITIES: EntityMeta[] = [
  {
    key: 'decks', model: 'deck', label: '덱', pk: 'id', softDelete: true, creatable: true, defaultSort: { field: 'updatedAt', dir: 'desc' },
    fields: [
      { name: 'id', label: 'ID', type: 'string', filterable: true, sortable: true },
      { name: 'slug', label: '슬러그 (배치 deck.id)', type: 'string', editable: true, required: true, filterable: true, searchable: true, sortable: true },
      { name: 'title', label: '제목', type: 'string', editable: true, required: true, filterable: true, searchable: true, sortable: true },
      { name: 'subject', label: '과목', type: 'string', editable: true, required: true, filterable: true, searchable: true, sortable: true },
      { name: 'language', label: '언어', type: 'string', editable: true, required: true, filterable: true, sortable: true },
      { name: 'description', label: '설명', type: 'text', editable: true, searchable: true, wide: true },
      { name: 'tagsJson', label: '태그', type: 'json', editable: true, wide: true },
      ...stamps,
    ],
  },
  {
    key: 'questions', model: 'question', label: '문항', pk: 'id', softDelete: true, creatable: true, defaultSort: { field: 'updatedAt', dir: 'desc' },
    fields: [
      { name: 'id', label: 'ID', type: 'string', filterable: true, sortable: true },
      { name: 'deckId', label: '덱', type: 'string', required: true, filterable: true, sortable: true, ref: 'decks' },
      { name: 'externalId', label: '문항 ID', type: 'string', filterable: true, searchable: true, sortable: true },
      { name: 'type', label: '유형', type: 'enum', enumValues: QUESTION_TYPES, filterable: true, sortable: true },
      { name: 'revision', label: '리비전', type: 'number', filterable: true, sortable: true },
      { name: 'sortIndex', label: '순서', type: 'number', editable: true, filterable: true, sortable: true },
      { name: 'payloadJson', label: '문항 JSON (스키마 검증됨)', type: 'json', editable: true, required: true, wide: true },
      { name: 'contentHash', label: '내용 해시', type: 'string', wide: true },
      { name: 'answerHash', label: '정답 해시', type: 'string', wide: true },
      ...stamps,
    ],
    display: { deck: { select: { title: true } } },
  },
  {
    key: 'cards', model: 'cardState', label: '카드 상태 (FSRS)', pk: 'questionId', softDelete: true, creatable: false, defaultSort: { field: 'dueAt', dir: 'asc' },
    fields: [
      { name: 'questionId', label: '문항', type: 'string', filterable: true, sortable: true, ref: 'questions' },
      { name: 'status', label: '상태', type: 'enum', enumValues: CARD_STATUS, filterable: true, sortable: true },
      { name: 'dueAt', label: '예정', type: 'datetime', editable: true, filterable: true, sortable: true },
      { name: 'stability', label: '안정성', type: 'number', filterable: true, sortable: true },
      { name: 'difficulty', label: '난이도', type: 'number', filterable: true, sortable: true },
      { name: 'reps', label: '복습 수', type: 'number', filterable: true, sortable: true },
      { name: 'lapses', label: '실패 수', type: 'number', filterable: true, sortable: true },
      { name: 'lastReviewAt', label: '마지막 복습', type: 'datetime', filterable: true, sortable: true },
      { name: 'suspended', label: '보류', type: 'boolean', editable: true, filterable: true, sortable: true },
      { name: 'flagged', label: '표시', type: 'boolean', editable: true, filterable: true, sortable: true },
      { name: 'buriedUntil', label: '묻어둠 해제', type: 'datetime', editable: true, filterable: true, sortable: true },
      { name: 'version', label: '버전', type: 'number', sortable: true },
      { name: 'stateJson', label: 'FSRS 상태 JSON', type: 'json', wide: true },
      ...stamps,
    ],
    display: { question: { select: { externalId: true, deckId: true } } },
  },
  {
    key: 'reviews', model: 'reviewLog', label: '복습 기록', pk: 'id', softDelete: true, creatable: false, defaultSort: { field: 'reviewedAt', dir: 'desc' },
    fields: [
      { name: 'id', label: 'ID', type: 'string', sortable: true },
      { name: 'questionId', label: '문항', type: 'string', filterable: true, sortable: true, ref: 'questions' },
      { name: 'sessionId', label: '세션', type: 'string', filterable: true, ref: 'sessions' },
      { name: 'rating', label: '평가 (1~4)', type: 'number', editable: false, filterable: true, sortable: true },
      { name: 'reviewRound', label: '회차', type: 'number', filterable: true, sortable: true },
      { name: 'previousStatus', label: '이전 상태', type: 'enum', enumValues: CARD_STATUS, filterable: true },
      { name: 'reviewedAt', label: '복습 시각', type: 'datetime', filterable: true, sortable: true },
      { name: 'elapsedMs', label: '소요 ms', type: 'number', editable: true, filterable: true, sortable: true },
      { name: 'isCorrect', label: '정답 여부', type: 'boolean', editable: true, filterable: true, sortable: true },
      { name: 'revealedBeforeAnswer', label: '답 없이 공개', type: 'boolean', editable: true, filterable: true },
      { name: 'hintUsed', label: '힌트 사용', type: 'boolean', editable: true, filterable: true },
      { name: 'undone', label: '되돌림', type: 'boolean', filterable: true, sortable: true },
      { name: 'schedulerVersion', label: '스케줄러', type: 'string', filterable: true },
      { name: 'answerPayloadJson', label: '답안 JSON', type: 'json', wide: true },
      ...stamps,
    ],
    display: { question: { select: { externalId: true, deckId: true } } },
  },
  {
    key: 'notes', model: 'questionNote', label: '메모 (회차별)', pk: 'id', softDelete: true, creatable: true, defaultSort: { field: 'updatedAt', dir: 'desc' },
    fields: [
      { name: 'id', label: 'ID', type: 'string', sortable: true },
      { name: 'questionId', label: '문항', type: 'string', required: true, filterable: true, sortable: true, ref: 'questions' },
      { name: 'reviewRound', label: '회차', type: 'number', required: true, editable: true, filterable: true, sortable: true },
      { name: 'reviewLogId', label: '복습 기록', type: 'string', filterable: true, ref: 'reviews' },
      { name: 'body', label: '내용', type: 'text', editable: true, required: true, searchable: true, wide: true },
      ...stamps,
    ],
    display: { question: { select: { externalId: true, deckId: true } } },
  },
  {
    key: 'subjects', model: 'subject', label: '과목', pk: 'id', softDelete: true, creatable: true, defaultSort: { field: 'name', dir: 'asc' },
    fields: [
      { name: 'id', label: 'ID', type: 'string', sortable: true },
      { name: 'name', label: '이름', type: 'string', editable: true, required: true, filterable: true, searchable: true, sortable: true },
      { name: 'color', label: '색', type: 'string', editable: true },
      { name: 'description', label: '설명', type: 'text', editable: true, searchable: true, wide: true },
      ...stamps,
    ],
  },
  {
    key: 'question-subjects', model: 'questionSubject', label: '문항–과목 연결', pk: 'questionId', softDelete: true, creatable: true, defaultSort: { field: 'createdAt', dir: 'desc' },
    fields: [
      { name: 'questionId', label: '문항', type: 'string', required: true, filterable: true, ref: 'questions' },
      { name: 'subjectId', label: '과목', type: 'string', required: true, filterable: true, ref: 'subjects' },
      { name: 'source', label: '출처', type: 'enum', enumValues: ['deck', 'manual'], editable: true, filterable: true },
      ...stamps,
    ],
    display: { subject: { select: { name: true } }, question: { select: { externalId: true } } },
  },
  {
    key: 'sessions', model: 'studySession', label: '학습 세션', pk: 'id', softDelete: true, creatable: false, defaultSort: { field: 'startedAt', dir: 'desc' },
    fields: [
      { name: 'id', label: 'ID', type: 'string', sortable: true },
      { name: 'deckId', label: '덱', type: 'string', filterable: true, ref: 'decks' },
      { name: 'scope', label: '범위', type: 'string', filterable: true, searchable: true },
      { name: 'mode', label: '모드', type: 'enum', enumValues: SESSION_MODES, filterable: true, sortable: true },
      { name: 'startedAt', label: '시작', type: 'datetime', filterable: true, sortable: true },
      { name: 'endedAt', label: '종료', type: 'datetime', editable: true, filterable: true, sortable: true },
      { name: 'queueSize', label: '큐 크기', type: 'number', filterable: true, sortable: true },
      ...stamps,
    ],
    display: { deck: { select: { title: true } } },
  },
  {
    key: 'practice', model: 'practiceLog', label: '연습 기록', pk: 'id', softDelete: true, creatable: false, defaultSort: { field: 'createdAt', dir: 'desc' },
    fields: [
      { name: 'id', label: 'ID', type: 'string', sortable: true },
      { name: 'questionId', label: '문항', type: 'string', filterable: true, ref: 'questions' },
      { name: 'sessionId', label: '세션', type: 'string', filterable: true, ref: 'sessions' },
      { name: 'isCorrect', label: '정답 여부', type: 'boolean', filterable: true, sortable: true },
      { name: 'elapsedMs', label: '소요 ms', type: 'number', filterable: true, sortable: true },
      { name: 'answerPayloadJson', label: '답안 JSON', type: 'json', wide: true },
      ...stamps,
    ],
    display: { question: { select: { externalId: true, deckId: true } } },
  },
  {
    key: 'exams', model: 'examAttempt', label: '시험', pk: 'id', softDelete: true, creatable: false, defaultSort: { field: 'startedAt', dir: 'desc' },
    fields: [
      { name: 'id', label: 'ID', type: 'string', sortable: true },
      { name: 'deckId', label: '덱', type: 'string', filterable: true, ref: 'decks' },
      { name: 'title', label: '제목', type: 'string', editable: true, filterable: true, searchable: true, sortable: true },
      { name: 'startedAt', label: '시작', type: 'datetime', filterable: true, sortable: true },
      { name: 'submittedAt', label: '제출', type: 'datetime', filterable: true, sortable: true },
      { name: 'configJson', label: '설정 JSON', type: 'json', wide: true },
      { name: 'scoreJson', label: '점수 JSON', type: 'json', wide: true },
      ...stamps,
    ],
    display: { deck: { select: { title: true } } },
  },
  {
    key: 'exam-responses', model: 'examResponse', label: '시험 응답', pk: 'id', softDelete: true, creatable: false, defaultSort: { field: 'createdAt', dir: 'desc' },
    fields: [
      { name: 'id', label: 'ID', type: 'string', sortable: true },
      { name: 'attemptId', label: '시험', type: 'string', filterable: true, ref: 'exams' },
      { name: 'questionId', label: '문항', type: 'string', filterable: true, ref: 'questions' },
      { name: 'isCorrect', label: '정답 여부', type: 'boolean', filterable: true, sortable: true },
      { name: 'selfScore', label: '자기평가 점수', type: 'number', editable: true, filterable: true, sortable: true },
      { name: 'answerPayloadJson', label: '답안 JSON', type: 'json', wide: true },
      { name: 'gradeDetailJson', label: '채점 상세', type: 'json', wide: true },
      ...stamps,
    ],
    display: { question: { select: { externalId: true } } },
  },
  {
    key: 'settings', model: 'appSettings', label: '앱 설정', pk: 'id', softDelete: false, creatable: false, defaultSort: { field: 'id', dir: 'asc' },
    fields: [
      { name: 'id', label: 'ID', type: 'string' },
      { name: 'newCardsPerDay', label: '하루 새 카드', type: 'number', editable: true },
      { name: 'reviewsPerDay', label: '하루 복습', type: 'number', editable: true },
      { name: 'dailyReviewGoal', label: '하루 목표', type: 'number', editable: true },
      { name: 'timezone', label: '시간대', type: 'string', editable: true },
      { name: 'shortcutsEnabled', label: '단축키', type: 'boolean', editable: true },
      { name: 'showIntervalPreview', label: '간격 미리보기', type: 'boolean', editable: true },
      { name: 'autoAdvanceAfterRating', label: '자동 다음', type: 'boolean', editable: true },
      { name: 'shuffleChoices', label: '보기 섞기', type: 'boolean', editable: true },
      { name: 'hideDifficulty', label: '난이도 가림', type: 'boolean', editable: true },
      { name: 'hideTags', label: '태그 가림', type: 'boolean', editable: true },
      { name: 'hideSubject', label: '과목·덱 가림', type: 'boolean', editable: true },
      { name: 'hideSource', label: '출처 가림', type: 'boolean', editable: true },
      { name: 'revealMetaOnAnswer', label: '정답 공개 시 메타 표시', type: 'boolean', editable: true },
      { name: 'essayAnswerView', label: '서술형 모범답안 보기', type: 'enum', enumValues: ['plain', 'scored'], editable: true },
      { name: 'newCardOrder', label: '새 카드 순서', type: 'enum', enumValues: ['deck', 'random'], editable: true },
      { name: 'requestRetention', label: '목표 기억률', type: 'number', editable: true },
      { name: 'maximumInterval', label: '최대 간격', type: 'number', editable: true },
      { name: 'enableFuzz', label: '퍼지', type: 'boolean', editable: true },
      { name: 'leechThreshold', label: '리치 기준', type: 'number', editable: true },
      { name: 'createdAt', label: '생성', type: 'datetime' },
      { name: 'updatedAt', label: '수정', type: 'datetime' },
    ],
  },
];

export const ENTITY_BY_KEY = new Map(ENTITIES.map((e) => [e.key, e]));
