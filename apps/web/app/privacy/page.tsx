import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactEmail, DocTable, LegalDoc, OPERATOR, Section } from '@/components/legal/legal-doc';

export const metadata: Metadata = { title: '개인정보처리방침', description: 'Recall Studio가 어떤 개인정보를 왜 수집하고 어떻게 보관·파기하는지 설명합니다.' };

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="개인정보처리방침"
      effective="2026년 10월 20일"
      summary={
        <ul className="list-disc space-y-1 pl-5">
          <li>Google 로그인으로 받는 정보는 <strong>계정 식별자·이메일·이름·프로필 사진</strong>뿐입니다. Gmail, 드라이브, 캘린더 등 다른 Google 데이터에는 접근하지 않습니다.</li>
          <li>이용자가 만든 덱·문항·메모·복습 기록은 이용자 본인의 학습 기능을 제공하는 데에만 씁니다. 광고, 판매, 프로파일링, AI 모델 학습에 쓰지 않습니다.</li>
          <li>광고·분석용 쿠키나 추적 도구를 쓰지 않습니다.</li>
          <li>데이터는 설정 화면에서 언제든 내보낼 수 있고, 설정 화면에서 계정을 삭제하면 모든 데이터가 즉시 영구 삭제됩니다.</li>
        </ul>
      }
    >
      <Section id="intro" title="1. 총칙">
        <p>
          {OPERATOR.name}(이하 “운영자”)는 {OPERATOR.service}(<a href={OPERATOR.url}>{OPERATOR.url.replace('https://', '')}</a>, 이하 “서비스”)를 운영하면서 「개인정보 보호법」 등 관련 법령을 지키고, 이용자의 개인정보를 아래와 같이 처리합니다.
          이 방침은 서비스 웹사이트와 설치형 웹앱(PWA)에 똑같이 적용됩니다.
        </p>
      </Section>

      <Section id="collect" title="2. 수집하는 개인정보 항목과 수집 방법">
        <h3>가. Google 계정으로 로그인할 때</h3>
        <p>Google 로그인(OAuth) 과정에서 이용자가 동의하면 Google로부터 다음 정보만 받습니다. 요청하는 권한 범위는 <code>openid</code>, <code>email</code>, <code>profile</code> 세 가지입니다.</p>
        <ul>
          <li>Google 계정 고유 식별자(sub)</li>
          <li>이메일 주소</li>
          <li>이름(Google 프로필에 표시되는 이름)</li>
          <li>프로필 사진 URL</li>
        </ul>
        <p>비밀번호는 Google이 직접 확인하며, 운영자는 이용자의 Google 비밀번호를 받거나 저장하지 않습니다.</p>

        <h3>나. 서비스를 이용하면서 이용자가 직접 입력하거나 만드는 정보</h3>
        <ul>
          <li>덱과 문항: 가져온 문제 묶음(JSON), 문항 본문·보기·정답·해설, 과목(태그)</li>
          <li>학습 기록: 복습 평가(다시/어려움/보통/쉬움), 제출한 답안, 응답 소요 시간, 학습 세션, 연습·시험 응시 기록과 점수</li>
          <li>메모: 문항별로 남긴 노트</li>
          <li>설정: 하루 학습량, 목표 기억률, 단축키·표시 옵션, 프롬프트 기본값 등</li>
        </ul>
        <p>덱이나 메모에 이름·연락처 같은 개인정보를 적지 않기를 권합니다. 적은 경우에도 그 내용은 이용자 본인에게만 보입니다.</p>

        <h3>다. 서비스 이용 중 자동으로 생기는 정보</h3>
        <ul>
          <li>가입 일시, 마지막 접속 일시</li>
          <li>서버 접속 기록: IP 주소, 요청 경로, 요청 시각, 브라우저 정보(User-Agent), 오류 기록. 호스팅 제공자(아래 5항)의 기본 로그로 남습니다.</li>
        </ul>

        <h3>수집하지 않는 정보</h3>
        <p>주민등록번호 등 고유식별정보, 결제 정보, 위치 정보, 연락처·주소록, 기기 식별자(광고 ID)는 수집하지 않습니다.</p>
      </Section>

      <Section id="purpose" title="3. 개인정보의 이용 목적">
        <ul>
          <li><strong>회원 식별과 로그인 유지</strong>: 같은 Google 계정으로 다시 로그인했을 때 본인의 데이터를 보여 주기 위해</li>
          <li><strong>학습 기능 제공</strong>: 덱 저장, 간격 반복(FSRS) 복습 일정 계산, 시험·연습, 통계와 백업·내보내기</li>
          <li><strong>화면 표시</strong>: 메뉴에 이름과 프로필 사진 표시</li>
          <li><strong>서비스 안정성과 보안</strong>: 장애 원인 파악, 부정 이용·공격 탐지와 차단</li>
          <li><strong>문의 응대</strong>: 이용자가 보낸 문의와 요청 처리, 약관·방침 변경 같은 중요한 안내</li>
        </ul>
        <p>위 목적 외의 용도로는 이용하지 않으며, 목적이 바뀌면 미리 알리고 필요한 경우 다시 동의를 받습니다.</p>
      </Section>

      <Section id="google" title="4. Google 사용자 데이터의 이용 (Limited Use)">
        <p>
          서비스가 Google API로부터 받은 정보의 이용과 다른 곳으로의 이전은 제한적 사용(Limited Use) 요건을 포함한{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API 서비스 사용자 데이터 정책</a>을 따릅니다.
        </p>
        <p lang="en" className="text-sm text-ink-3">
          {OPERATOR.service}’s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.
        </p>
        <ul>
          <li>Google에서 받은 정보는 로그인과 계정 표시에만 씁니다.</li>
          <li>이 정보를 판매하거나 광고(맞춤형·재타깃팅 광고 포함)에 쓰지 않습니다.</li>
          <li>이 정보를 사람이 열람하지 않습니다. 다만 이용자가 명시적으로 동의하거나, 보안 사고 조사·법령 준수에 필요한 경우는 예외입니다.</li>
          <li>이 정보를 AI·머신러닝 모델 학습에 쓰지 않습니다.</li>
        </ul>
      </Section>

      <Section id="processors" title="5. 처리 위탁과 국외 이전">
        <p>
          운영자는 서비스를 운영하려고 아래 사업자의 클라우드 인프라를 이용합니다. 이 사업자들은 운영자를 대신해 데이터를 보관·처리할 뿐, 자신의 목적으로 이용하지 않습니다.
          서비스 이용 시 네트워크를 통해 수시로 전송되며, 보관 기간은 아래 6항과 같습니다.
        </p>
        <DocTable
          head={['이전받는 자', '국가(위치)', '맡기는 일', '이전되는 항목']}
          rows={[
            ['Vercel Inc.', '미국 (전 세계 엣지 네트워크)', '웹사이트 호스팅, 로그인 세션 처리', '접속 기록, 로그인 세션 정보(계정 식별자·이메일·이름·사진 URL)'],
            ['Amazon Web Services, Inc.', '일본 (도쿄 리전)', 'API 서버 실행, 서버 로그 보관', '2항의 모든 항목'],
            ['PingCAP (TiDB Cloud)', '일본 (AWS 도쿄 리전)', '데이터베이스 저장', '2항 가·나의 모든 항목, 가입·접속 일시'],
            ['Google LLC', '미국', '로그인 인증(이용자가 Google에 직접 로그인)', 'Google이 처리하는 로그인 정보'],
          ]}
        />
        <p className="mt-3">국외 이전을 원하지 않으면 서비스 이용을 중단하고 7항에 따라 계정을 삭제할 수 있습니다. 다만 위 인프라 없이는 서비스를 제공할 수 없어 이용이 불가능합니다.</p>
      </Section>

      <Section id="retention" title="6. 보유 기간과 파기">
        <DocTable
          head={['정보', '보유 기간']}
          rows={[
            ['계정 정보, 덱·문항·학습 기록·메모·설정', '계정 삭제 시까지. 설정 화면에서 삭제하면 즉시, 이메일로 요청하면 30일 이내에 영구 삭제합니다.'],
            ['앱에서 삭제한 덱·문항·메모 등', '화면에서는 바로 사라지지만 실수 복구를 위해 “삭제됨” 상태로 보관하다가, 계정 삭제 시 함께 영구 삭제합니다. 바로 영구 삭제를 원하면 요청해 주세요.'],
            ['서버 접속 기록', '호스팅 제공자의 로그 보관 기간 동안 보관 후 자동 삭제'],
            ['데이터베이스 자동 백업', '삭제 후에도 백업 주기가 끝날 때까지 백업본에 남을 수 있으며, 이후 순차적으로 덮어써져 사라집니다.'],
          ]}
        />
        <p className="mt-3">법령에 따라 보존해야 하는 정보가 생기면 그 기간 동안만 분리해 보관합니다. 전자적 파일은 복구할 수 없는 방법으로 삭제합니다.</p>
      </Section>

      <Section id="rights" title="7. 이용자의 권리와 행사 방법">
        <p>이용자는 언제든지 자신의 개인정보에 대해 다음 권리를 행사할 수 있습니다.</p>
        <ul>
          <li><strong>열람·정정</strong>: 서비스 화면(덱, 데이터 메뉴)에서 직접 보고 고칠 수 있습니다. 이름과 사진은 Google 계정에서 바꾸면 다음 로그인 때 반영됩니다.</li>
          <li><strong>내보내기</strong>: <Link href="/settings">설정</Link> 화면의 “전체 백업(JSON)”과 “복습 기록 CSV”로 내 데이터를 내려받을 수 있습니다.</li>
          <li><strong>삭제(회원 탈퇴)</strong>: <Link href="/settings#delete-account">설정</Link> 화면 맨 아래 “계정 삭제”에서 계정 이메일을 입력해 확인하면 계정과 모든 학습 데이터(덱·문항·복습 기록·메모·시험 기록·설정)가 즉시 영구 삭제되고 로그아웃됩니다. 되돌릴 수 없으니 먼저 전체 백업을 받아 두기를 권합니다. 앱에서 삭제할 수 없는 경우에는 가입한 Google 계정 이메일로 <ContactEmail />에 요청하면 본인 확인 후 30일 이내에 영구 삭제하고 결과를 알려 드립니다.</li>
          <li><strong>처리 정지·동의 철회</strong>: 위 이메일로 요청할 수 있습니다. Google 계정의 <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">서드파티 연결 관리</a>에서 서비스 연결을 끊으면 더 이상 로그인되지 않습니다. 연결을 끊어도 저장된 데이터는 자동으로 지워지지 않으니, 삭제를 원하면 연결을 끊기 전에 설정 화면에서 계정을 삭제하거나 이메일로 요청해 주세요.</li>
        </ul>
        <p>요청은 지체 없이, 늦어도 10일 이내에 처리하거나 처리할 수 없는 사유를 알려 드립니다. 법정대리인이나 위임받은 사람을 통해서도 요청할 수 있습니다.</p>
      </Section>

      <Section id="cookies" title="8. 쿠키와 브라우저 저장소">
        <p>서비스는 동작에 꼭 필요한 저장소만 씁니다. 광고·분석·추적용 쿠키는 쓰지 않습니다.</p>
        <ul>
          <li><strong>로그인 세션 쿠키</strong>(<code>authjs.session-token</code> 등): 암호화된 로그인 상태. 최대 30일 유지되며 로그아웃하면 지워집니다. 로그인 과정의 보안 확인용 쿠키(CSRF·콜백 주소)도 함께 쓰입니다.</li>
          <li><strong>로컬 저장소</strong>: 화면 테마(라이트/다크) 선택</li>
          <li><strong>세션 저장소</strong>: 학습 중인 카드 순서. 탭을 닫거나 로그아웃하면 지워집니다.</li>
          <li><strong>서비스 워커 캐시</strong>: 오프라인에서도 앱을 열 수 있도록 방문한 화면의 HTML·스크립트·아이콘 파일. 학습 데이터와 로그인 정보는 캐시하지 않습니다.</li>
        </ul>
        <p>브라우저 설정에서 쿠키를 거부할 수 있지만, 그러면 로그인이 되지 않아 서비스를 이용할 수 없습니다.</p>
      </Section>

      <Section id="security" title="9. 안전성 확보 조치">
        <ul>
          <li>모든 통신은 HTTPS(TLS)로 암호화하고, 서버와 데이터베이스 사이 연결도 TLS로 암호화합니다.</li>
          <li>모든 데이터는 계정별로 분리되어 저장되며, 서버는 요청마다 로그인 토큰을 검증하고 본인 데이터만 조회·수정할 수 있게 합니다.</li>
          <li>API 접근 토큰은 1시간 뒤 만료됩니다.</li>
          <li>데이터베이스와 서버 접근 권한은 운영자 본인으로 한정하고, 접근 키는 별도로 안전하게 보관합니다.</li>
        </ul>
      </Section>

      <Section id="children" title="10. 만 14세 미만 아동">
        <p>서비스는 만 14세 미만 아동을 대상으로 하지 않으며, 만 14세 미만은 가입할 수 없습니다. 만 14세 미만 아동의 정보가 수집된 사실을 알게 되면 즉시 삭제합니다.</p>
      </Section>

      <Section id="officer" title="11. 개인정보 보호책임자">
        <p>개인정보 처리에 관한 문의, 불만, 피해 구제 요청은 아래로 연락해 주세요. 지체 없이 답변하고 처리합니다.</p>
        <ul>
          <li>개인정보 보호책임자: {OPERATOR.name} (운영자)</li>
          <li>이메일: <ContactEmail /></li>
        </ul>
      </Section>

      <Section id="remedy" title="12. 권익 침해 구제 방법">
        <p>개인정보 침해에 대한 신고나 상담이 필요하면 아래 기관에 문의할 수 있습니다.</p>
        <ul>
          <li>개인정보침해신고센터: <a href="https://privacy.kisa.or.kr" target="_blank" rel="noreferrer">privacy.kisa.or.kr</a> / 국번 없이 118</li>
          <li>개인정보분쟁조정위원회: <a href="https://www.kopico.go.kr" target="_blank" rel="noreferrer">www.kopico.go.kr</a> / 1833-6972</li>
          <li>대검찰청 사이버수사과: <a href="https://www.spo.go.kr" target="_blank" rel="noreferrer">www.spo.go.kr</a> / 국번 없이 1301</li>
          <li>경찰청 사이버수사국: <a href="https://ecrm.police.go.kr" target="_blank" rel="noreferrer">ecrm.police.go.kr</a> / 국번 없이 182</li>
        </ul>
      </Section>

      <Section id="changes" title="13. 방침의 변경">
        <p>
          이 방침을 바꾸면 시행 7일 전부터 이 페이지와 서비스 화면에 알립니다. 수집 항목이나 이용 목적이 늘어나는 등 이용자 권리에 중요한 변경은 30일 전에 알리고, 필요하면 다시 동의를 받습니다.
          이 방침은 2026년 10월 20일부터 시행합니다.
        </p>
      </Section>
    </LegalDoc>
  );
}
