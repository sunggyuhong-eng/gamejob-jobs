export const PIPELINE_STAGES = [
  '온라인 과제', '코딩테스트', '역량검사', '면접', '1차 면접',
  '2차 면접', '면접합격', '처우단계', 'Offer',
] as const

export type PipelineStage = typeof PIPELINE_STAGES[number]

export type Candidate = {
  id: string
  row: number
  name: string
  stage: PipelineStage
  project: string
  openingTitle: string
  hireDate?: string
  firstInterviewDate?: string
  secondInterviewDate?: string
}

export type Opening = {
  id: string
  title: string
  project: string
  url: string
  postedAt: string
  deadline: string
  status: '진행중' | '마감'
  targetTo: number
  hiredCount: number
  reason: string
  source: 'sheet'
  isNew: boolean
  candidates: Candidate[]
}

export type DashboardData = {
  openings: Opening[]
  syncedAt: string
  candidateCount: number
  sheetApiUrl?: string
}
