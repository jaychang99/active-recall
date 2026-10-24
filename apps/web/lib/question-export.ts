import type { AnswerPayload, EssayQuestion, GradeResult, Question } from '@recall/contracts';
import type { CardInfo, Note } from './api';
import { TYPE_LABEL } from './utils';

/** Everything the learner can see about one question after answering it, as one JSON document. */
export interface QuestionExport {
  format: 'recall-studio/question-export@1';
  exportedAt: string;
  deck: { id: string; title: string; subject: string };
  subjects: string[];
  question: { id: string; externalId: string; type: string; typeLabel: string; revision: number | null; data: Question };
  attempt: {
    reviewRound: number;
    revealedBeforeAnswer: boolean;
    hintUsed: boolean;
    answerPayload: AnswerPayload | null;
    grade: GradeResult | null;
  };
  card: CardInfo;
  notes: { reviewRound: number; body: string; updatedAt: string; review: { rating: string; reviewedAt: string; isCorrect: boolean | null } | null }[];
}

export interface QuestionExportInput {
  question: { id: string; externalId: string; type: string; revision?: number | null; data: Question };
  deck: QuestionExport['deck'];
  subjects: string[];
  card: CardInfo;
  reviewRound: number;
  revealedBeforeAnswer: boolean;
  hintUsed: boolean;
  answerPayload: AnswerPayload | null;
  grade: GradeResult | null;
  notes: Note[];
  now?: Date;
}

const RATING_LABEL = ['Again', 'Hard', 'Good', 'Easy'] as const;

export function buildQuestionExport(i: QuestionExportInput): QuestionExport {
  return {
    format: 'recall-studio/question-export@1',
    exportedAt: (i.now ?? new Date()).toISOString(),
    deck: i.deck,
    subjects: i.subjects,
    question: { id: i.question.id, externalId: i.question.externalId, type: i.question.type, typeLabel: TYPE_LABEL[i.question.type] ?? i.question.type, revision: i.question.revision ?? null, data: i.question.data },
    attempt: {
      reviewRound: i.reviewRound,
      revealedBeforeAnswer: i.revealedBeforeAnswer,
      hintUsed: i.hintUsed,
      // A reveal without submitting has no real answer (ordering/parsons start with a default arrangement).
      answerPayload: i.revealedBeforeAnswer ? null : i.answerPayload,
      grade: i.revealedBeforeAnswer ? null : i.grade,
    },
    card: i.card,
    notes: i.notes
      .filter((n) => n.body.trim().length > 0)
      .map((n) => ({
        reviewRound: n.reviewRound,
        body: n.body,
        updatedAt: n.updatedAt,
        review: n.review && !n.review.undone ? { rating: RATING_LABEL[n.review.rating - 1] ?? String(n.review.rating), reviewedAt: n.review.reviewedAt, isCorrect: n.review.isCorrect } : null,
      })),
  };
}

const DATA_URI = /^data:([^;,]+)(;base64)?,/;

/** Base64 image payloads are unreadable as pasted text and can run to megabytes; swap them for a short marker. */
export function stripDataUris<T>(value: T): T {
  if (typeof value === 'string') {
    const m = DATA_URI.exec(value);
    if (!m || value.length < 512) return value;
    return `[${m[1]} 이미지 데이터 생략 · 약 ${Math.round((value.length * 3) / 4 / 1024)} KB — 필요하면 이미지를 따로 첨부합니다]` as T;
  }
  if (Array.isArray(value)) return value.map(stripDataUris) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripDataUris(v)])) as T;
  return value;
}

export function exportJson(e: QuestionExport): string {
  return JSON.stringify(e, null, 2);
}

export function explainPrompt(e: QuestionExport): string {
  const wrong = e.attempt.grade?.isCorrect === false;
  return `아래는 내가 학습 앱(Recall Studio)에서 방금 푼 문제 하나의 전체 데이터(JSON)입니다. 문제·보기·그래픽(SVG/이미지 설명)·정답·해설·보기별 해설·출처·내 답안·채점 결과·회차별 메모가 모두 들어 있습니다. 이 데이터를 바탕으로 앱에 저장된 해설보다 훨씬 자세한 해설을 부탁합니다.

## 부탁하는 것
1. **핵심 개념**: 이 문제가 묻는 개념·원리를 먼저 정리해 주세요. 왜 중요한지, 어디에 쓰이는지도 함께.
2. **정답 도출 과정**: 정답에 이르는 사고 과정을 단계별로 설명해 주세요. 계산이 있으면 중간 과정을 생략하지 마세요.
3. **보기·항목별 분석**: 보기(또는 진술·빈칸·단계 등 각 항목)마다 왜 맞는지 / 왜 틀린지, 어떤 오개념을 노린 함정인지 설명해 주세요.
4. **내 답안 분석**: \`attempt\`에 있는 내 답안${wrong ? '이 틀렸습니다. 어떤 생각의 흐름으로 이 답을 골랐을지 추정하고, 어디서 어긋났는지 짚어 주세요' : `과 채점 결과를 보고, 맞았더라도 우연히 맞혔을 가능성이나 헷갈리기 쉬운 지점을 짚어 주세요`}. 정답을 미리 공개했다면(\`revealedBeforeAnswer: true\`) 이 항목은 건너뛰어도 됩니다.
5. **메모에 대한 답**: \`notes\`(회차별 메모)에 적힌 질문·헷갈린 점·생각이 있으면 하나씩 답해 주세요.
6. **기억 전략**: 오래 기억하기 위한 요령(비유, 연상, 대비되는 개념과의 비교표 등)과, 이해를 확인할 수 있는 변형 문제 2–3개(정답·짧은 해설 포함)를 제시해 주세요.
7. **검토**: 저장된 정답이나 해설에 오류·모호한 부분·최신 정보와 다른 부분이 있다고 판단되면 근거와 함께 지적해 주세요.
8. **메모**: 답변의 맨 마지막에, 내가 학습 앱의 이 문제 '메모'란에 그대로 붙여넣을 수 있는 메모 하나를 추가해 주세요. 위 해설 전체를 요약하되 핵심 위주로 — 묻는 개념 한 줄, 정답과 그 근거, 내가 틀렸거나 헷갈리기 쉬운 지점, 기억 요령. 분량 제한은 없습니다. 마크다운·LaTeX·표 없이 일반 텍스트(plain text)로만 쓰고, 복사하기 쉽도록 \`\`\`text 코드 블록 하나에 담아 주세요.

## 형식
- 한국어로, 제목과 목록을 써서 읽기 쉽게 정리해 주세요. 수식은 LaTeX(\`$…$\`, \`$$…$$\`)로 써 주세요.
- \`question.data.source\` 등 출처 정보가 있으면 그 자료의 맥락에 맞춰 설명하되, 확인할 수 없는 페이지 번호나 인용은 지어내지 마세요.
- 이미지 데이터는 길이 때문에 생략되었을 수 있습니다. 그 경우 \`alt\`/설명 텍스트를 참고하고, 판단이 어려우면 이미지를 요청해 주세요.
- 마지막 '메모' 섹션은 제목 \`## 메모\` 아래에 \`\`\`text 블록 하나만 두세요(그 안은 일반 텍스트).

## 문제 데이터
\`\`\`json
${exportJson(stripDataUris(e))}
\`\`\`
`;
}

/**
 * A grading request for an essay answer: score it criterion by criterion against the stored rubric and model answer.
 * The answer text is passed separately because essays are often revealed rather than submitted, and the export
 * drops a revealed attempt's answer.
 */
export function essayGradingPrompt(e: QuestionExport, answerText: string, selfScores?: number[]): string {
  const q = e.question.data as EssayQuestion;
  const { rubric, maxScore, modelAnswer, modelAnswerSegments } = q.answer;
  const criteria = rubric.length
    ? rubric.map((r, i) => `${i + 1}. **${r.criterion}** (${r.maxPoints}점)\n   - 채점 지침: ${r.guidance}`).join('\n')
    : `따로 정해진 기준이 없습니다. 모범답안과 비교해 ${maxScore}점 만점으로 채점해 주세요.`;
  const segments = modelAnswerSegments?.some((s) => s.points)
    ? `\n\n### 모범답안 문장별 배점\n${modelAnswerSegments.map((s) => `- ${s.text.trim()}${s.points ? ` — ${s.points}점${typeof s.rubricIndex === 'number' && rubric[s.rubricIndex] ? ` (기준 ${s.rubricIndex + 1}. ${rubric[s.rubricIndex]!.criterion})` : ''}` : ''}${s.note ? ` · ${s.note}` : ''}`).join('\n')}`
    : '';
  const self = selfScores?.length && rubric.length
    ? `\n\n## 내 자기 채점\n${rubric.map((r, i) => `- ${r.criterion}: ${selfScores[i] ?? 0} / ${r.maxPoints}`).join('\n')}\n- 합계: ${rubric.reduce((sum, _r, i) => sum + (selfScores[i] ?? 0), 0)} / ${maxScore}`
    : '';
  return `아래는 내가 학습 앱(Recall Studio)에서 서술형 문제에 쓴 답안입니다. 문제에 저장된 채점 기준(루브릭)과 모범답안에 따라 엄격하고 공정하게 채점해 주세요.

## 문제
${q.prompt}

## 채점 기준 (총 ${maxScore}점)
${criteria}

## 모범답안
${modelAnswer}${segments}

## 내 답안
\`\`\`text
${answerText.trim()}
\`\`\`${self}

## 채점 방법
1. 기준마다 0점부터 배점까지 점수를 주세요(채점 지침이 부분 점수를 허용하면 그에 따르세요). 근거는 내 답안의 문장을 그대로 인용해 설명하고, 답안에 쓰지 않은 내용을 의도로 짐작해 점수를 주지 마세요.
2. 모범답안과 표현이 달라도 의미가 같으면 인정하세요. 사실 오류·모순·핵심 용어의 오용은 감점 사유로 분명히 적어 주세요.
3. 빠뜨린 핵심 내용, 틀린 내용, 모호하거나 근거가 부족한 서술을 나눠서 정리해 주세요.
4. 위에 자기 채점이 있으면 기준별로 비교하고, 점수가 다른 기준은 왜 다른지 설명해 주세요.
5. 같은 기준으로 만점을 받을 수 있도록 내 답안을 고쳐 쓴 예시를 보여 주세요. 내 문장과 구성을 최대한 살리고, 바꾼 부분이 드러나게 해 주세요.
6. 저장된 채점 기준이나 모범답안 자체에 오류·모호함이 있다고 판단되면 근거와 함께 지적해 주세요.

## 형식
- 한국어로 쓰고, 첫 줄은 \`총점: X / ${maxScore}\` 형식으로 시작해 주세요.
- 이어서 기준별 표(| 기준 | 배점 | 점수 | 근거 |)를 두고, 그 아래에 3–6번 내용을 제목을 붙여 정리해 주세요. 수식은 LaTeX(\`$…$\`)로 써 주세요.
- 맨 마지막에 제목 \`## 메모\` 아래, 학습 앱의 '메모'란에 그대로 붙여넣을 메모를 \`\`\`text 코드 블록 하나에 일반 텍스트로 담아 주세요: 총점, 기준별 점수, 빠뜨린 점, 다음에 기억할 것.

## 문제 데이터 (참고용 전체 JSON — 출처·해설·회차별 메모 포함)
\`\`\`json
${exportJson(stripDataUris(e))}
\`\`\`
`;
}
