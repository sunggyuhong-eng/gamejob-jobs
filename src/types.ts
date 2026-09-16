export type Job = {
  id: string; company: string; title: string; url: string; categories: string[];
  original_categories: string[]; career: string | null; employment_type: string | null;
  job_major_categories?: string[]; job_subcategories?: string[];
  location: string | null; posted_at: string | null; deadline: string | null;
  always_open: boolean; logo_url: string | null; representative_game: string | null; collected_at: string;
  company_url?: string | null; company_type?: string | null; main_business?: string | null;
  established_year?: string | null; employee_count?: string | null;
}

export type Snapshot = { schema_version:number; period:string; collected_at:string; is_sample:boolean; jobs:Job[] }
export type History = { is_sample?:boolean; months:{month:string;total_open:number;new_count:number|null;closed_count:number|null}[] }
export type CategoryHistory = {
  is_sample?:boolean;
  taxonomy?:Record<string,string[]>;
  periods:{period:string;major:Record<string,number>;sub:Record<string,number>;sub_by_major?:Record<string,Record<string,number>>}[]
}
export type StatRow = { name:string; current:number; previous:number|null; change:number|null }
export type CompanyGroups = { groups:Record<string,{members:string[];note?:string}> }
export type NewsItem = { source:string;title:string;url:string;published_at?:string|null;summary?:string|null;issue_type?:string;companies?:string[] }
export type ReportMethodology = {
  prompt_version:string; system_prompt:string; input_description:string; rules:string[];
  evidence:{baseline_period?:string|null;current_period?:string|null;previous_open_jobs?:number|null;current_open_jobs?:number|null;job_examples_sent:number;news_candidates:number;news_sent_to_model:number;news_date_from?:string|null;news_date_to?:string|null}
}
export type ReportAnalysis = {
  outlook:string; market_comment:string; highlights:string[];
  job_insights:{name:string;direction:'강세'|'약세'|'보합';comment:string}[];
  company_insights:{name:string;direction:'증가'|'감소'|'보합';comment:string;evidence_level:'직접 근거'|'관련 가능성'|'근거 부족';job_ids:string[];news_urls:string[]}[];
  news_signals:{company:string;headline:string;comment:string;evidence_level:'직접 근거'|'관련 가능성'|'근거 부족';news_urls:string[]}[];
  watchlist:string[]; limitations:string[];
}
export type Report = { period:string; baseline_period?:string; current_period?:string; comparison_label?:string; is_sample:boolean; status:string; statistics:any; analysis?:ReportAnalysis|null; markdown:string|null; error?:string; methodology?:ReportMethodology; news?:NewsItem[]; generated_at?:string|null; report_schema_version?:number; pdf_path?:string|null }
export type Status = { is_sample:boolean; success:boolean; finished_at:string; message?:string; sources:{name:string;status:string;count:number;error?:string}[] }
