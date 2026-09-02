export const meta = {
  name: 'dt-concepts-to-lectures',
  description: 'DT 오개념을 exam 저장소의 개념강의 125편에 잇는다 (배선 → 적대적 반박)',
  phases: [
    { title: '배선', detail: '오개념마다 실제 문항 문장을 읽고 맞는 강의를 고른다' },
    { title: '반박', detail: '강의 본문을 직접 열어, 고른 강의가 정말 그 오류를 고치는지 반박한다' },
  ],
}

const WIP = '/home/user/dt/tools/_lecwip'
const KEYS = (args && args.keys) || []

const S_WRITE = {
  type: 'object', additionalProperties: false, required: ['linked', 'empty', 'notes'],
  properties: { linked: { type: 'integer' }, empty: { type: 'integer' }, notes: { type: 'string' } },
}
const S_FIX = {
  type: 'object', additionalProperties: false, required: ['fixed', 'detail'],
  properties: { fixed: { type: 'integer' }, detail: { type: 'string' } },
}

const WHY = [
  '무엇을 하는 일인가',
  '',
  'DT 주간 시험의 오답 개념 클리닉에는 개념마다 「▶ 강의 보기」 문이 선다.',
  '그 문이 어느 강의로 열리는지를 정하는 일이다.',
  '',
  '틀린 강의로 열리는 것은 **문이 없는 것보다 나쁘다.** 학생은 헛걸음을 하고,',
  '그 헛걸음이 「강의는 도움이 안 된다」는 학습으로 남는다. 그래서 맞는 강의가',
  '없으면 **비워 두는 것이 맞다.** 억지로 가까운 데로 보내지 않는다.',
].join('\n')

const RULES = [
  '규칙 — 반드시 지킨다.',
  '',
  '1. **`ex` 를 먼저 읽어라.** 그 오개념이 붙은 **실제 시험 문장과 해설**이다.',
  '   이름만 보고 고르면 안 된다 — 이름이 닮았다고 내용이 같지는 않다.',
  '2. **강의 본문을 직접 열어 확인해라.** 후보 강의 파일은 `/home/user/exam/<파일이름>`',
  '   에 있다. Read 나 grep 으로 그 강의가 정말 그 내용을 가르치는지 봐라.',
  '   절 제목만 보지 말고 본문을 봐라.',
  '3. **`guess` 는 이름이 겹치는 강의일 뿐이다.** 믿지 말고 의심해라. guess 를',
  '   확인 없이 그대로 두는 것이 가장 흔한 실패다.',
  '   (실제 사례: 「결합 차수」의 guess 는 lec-020 이었는데, 020 은 결합 차수를',
  '    「공유한 전자쌍 수」로만 정의하고 결합성/반결합성이라는 말이 파일 전체에 없다.',
  '    DT 문항은 분자 오비탈 판 결합 차수를 물었다 — 맞는 곳은 lec-027 이었다.)',
  '4. **좁은 쪽을 고른다.** 개요 강의와 전용 강의가 둘 다 맞으면 전용 쪽이다.',
  '5. **맞는 강의가 없으면 `pick` 을 빈 글자열로 두고 `why` 에 그 사실을 적어라.**',
  '   125강 전체를 grep 해 보고 정말 없는지 확인한 뒤에 그렇게 적는다.',
  '6. **한 이름이 두 단원에서 다른 뜻이면** `byUnit` 에 `{"과목/단원": "파일이름"}`',
  '   으로 갈라 적는다. 그때는 `pick` 을 비운다.',
  '7. **`why` 에는 근거를 적는다** — 그 강의 본문의 어느 대목이 이 오류를 고치는지.',
  '   「이름이 같다」는 근거가 아니다.',
  '8. **파일 이름을 지어내지 않는다.** `lectures.txt` 에 있는 이름만 쓴다.',
  '9. 모든 문장은 평서체(「~다.」)로 쓴다.',
].join('\n')

phase('배선')

const results = await pipeline(
  KEYS,

  function (key) {
    const p = 'DT 오개념을 개념강의에 잇는다.\n\n' + WHY + '\n\n'
      + '조각: `' + WIP + '/' + key + '.json`\n'
      + '강의 목록: `' + WIP + '/lectures.txt` (파일이름<탭>제목, 125줄)\n'
      + '강의 본문: `/home/user/exam/<파일이름>`\n\n'
      + RULES + '\n\n'
      + '조각 파일을 열어 항목마다 `pick` 과 `why` 를 채워라(필요하면 `byUnit`).\n'
      + '**같은 파일을 제자리에서 고친다** — 다른 칸(n·units·ex·guess)은 건드리지 않는다.\n'
      + '다 쓴 뒤 파일을 다시 읽어 JSON 이 유효하고 항목 수가 그대로인지 확인해라.'
    return agent(p, { label: '배선:' + key, phase: '배선', effort: 'high', schema: S_WRITE })
      .then(r => Object.assign({ key: key }, r || { linked: 0, empty: 0, notes: '배선 실패' }))
  },

  function (_r, key) {
    const p = '이어진 배선을 **반박한다**. 통과시키는 것이 아니라 틀린 것을 찾는 것이 목적이다.\n\n'
      + '조각: `' + WIP + '/' + key + '.json`\n'
      + '강의 목록: `' + WIP + '/lectures.txt`\n'
      + '강의 본문: `/home/user/exam/<파일이름>`\n\n'
      + '항목마다 `ex`(실제 시험 문장과 해설)를 읽고, `pick` 이 가리키는 강의를 **네가 직접**\n'
      + '열어 본문을 읽어라. 그런 다음 따진다.\n\n'
      + 'A. **이름만 닮은 자리인가.** 그 강의가 정말 이 오류를 다루는가, 아니면 같은 낱말을\n'
      + '   다른 뜻으로 쓰는가. 본문에 그 내용이 실제로 있는지 grep 으로 확인해라.\n'
      + 'B. **넓은 강의를 골랐는가.** 더 좁은 전용 강의가 있는데 개요로 보내지는 않았는가.\n'
      + 'C. **guess 를 확인 없이 그대로 두었는가.** why 가 「이름이 같다」 수준이면 의심해라.\n'
      + 'D. **없는 파일을 가리키는가.** lectures.txt 에 없는 이름은 즉시 문제다.\n'
      + 'E. **빈 자리 판정이 맞는가.** `pick` 이 비어 있다면, 정말 125강 어디에도 없는지\n'
      + '   네가 grep 으로 확인해라. 있는데 못 찾은 것이면 채워 넣어라.\n'
      + '   반대로 억지로 이어 붙인 자리가 있으면 비워라 — 헛걸음은 문이 없는 것보다 나쁘다.\n'
      + 'F. **한 이름이 두 단원에서 다른 뜻인데 하나로 묶지는 않았는가.**\n\n'
      + '틀린 것을 찾으면 **직접 고쳐라**(같은 파일을 제자리에서). 고칠 때 why 도 함께 고친다.\n'
      + '고친 자리와 그 근거를 `detail` 에 적어라. 확인해 보고 배선이 맞으면 손대지 않는다 —\n'
      + '그 사실도 적어라.\n\n' + RULES
    return agent(p, { label: '반박:' + key, phase: '반박', effort: 'high', schema: S_FIX })
      .then(r => Object.assign({ key: key }, r || { fixed: 0, detail: '반박 실패' }))
  },
)

const rows = results.filter(Boolean)
log('조각 ' + rows.length + '/' + KEYS.length + ' 완료')
return {
  done: rows.length,
  fixed: rows.reduce((a, r) => a + (r.fixed || 0), 0),
  detail: rows,
}
