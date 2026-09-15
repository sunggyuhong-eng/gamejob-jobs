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
export type CategoryHistory = { is_sample?:boolean; periods:{period:string;major:Record<string,number>;sub:Record<string,number>}[] }
export type ReportMethodology = {
  prompt_version:string; system_prompt:string; input_description:string; rules:string[];
  evidence:{baseline_period?:string|null;current_period?:string|null;previous_open_jobs?:number|null;current_open_jobs?:number|null;job_examples_sent:number;news_candidates:number;news_sent_to_model:number;news_date_from?:string|null;news_date_to?:string|null}
}
export type Report = { period:string; baseline_period?:string; current_period?:string; comparison_label?:string; is_sample:boolean; status:string; statistics:any; markdown:string|null; error?:string; methodology?:ReportMethodology }
export type Status = { is_sample:boolean; success:boolean; finished_at:string; message?:string; sources:{name:string;status:string;count:number;error?:string}[] }
