from typing import Any

from pydantic import BaseModel


class InvestigationSummary(BaseModel):
    accession: str
    acronym: str | None
    title: str
    project_type: str | None
    flight_platform: str | None
    sub_research_area: str | None
    start_date: str | None
    end_date: str | None
    fuel_phase: str | None
    roles: list[str]
    tags: list[str]
    hardware_family: str | None
    n_tests: int
    n_publications: int
    objectives_excerpt: str | None = None
    score: float | None = None


class Publication(BaseModel):
    title: str
    authors: str | None
    doi: str | None


class Contact(BaseModel):
    name: str
    affiliation: str | None


class ColumnSummary(BaseModel):
    column: str
    status: str  # constant | varies | empty
    distinct: int
    numeric_min: float | None = None
    numeric_max: float | None = None
    example_values: list[str]


class TableInfo(BaseModel):
    table: str
    kind: str
    n_rows: int
    encoding: str
    source_file: str
    columns: list[str]
    notes: list[str]
    curator_note: str | None
    column_summary: list[ColumnSummary]


class InvestigationDetail(InvestigationSummary):
    doi: str | None
    license: str | None
    hardware: str | None
    hardware_link: str | None
    nasa_center: str | None
    sponsor: str | None
    objectives: str | None
    approach: str | None
    hypothesis: str | None
    research_impacts: str | None
    keywords: list[str]
    related: list[dict[str, Any]]
    contacts: list[Contact]
    psi_url: str
    record_source: str
    curation_basis: str | None
    total_file_size: float | None
    release_date: str | None
    publications: list[Publication]
    tables: list[TableInfo]
    file_categories: list[dict[str, Any]]


class Quantity(BaseModel):
    value: float | None = None
    min: float | None = None
    max: float | None = None
    quality: str | None = None
    raw: str | None = None


class TestRow(BaseModel):
    id: int
    accession: str
    table: str
    row_index: int
    kind: str
    fuel: str | None
    fuel_raw: str | None
    o2: float | None
    o2_quality: str | None
    pressure: float | None
    pressure_quality: str | None
    flow: float | None
    flow_quality: str | None
    flow_direction: str | None
    burn_time: float | None
    outcome: str | None
    raw: dict[str, str]
    harmonized: dict[str, Any]
    provenance: dict[str, str]


class TestPage(BaseModel):
    total: int
    items: list[TestRow]


class FacetCount(BaseModel):
    key: str
    count: int


class Stats(BaseModel):
    n_investigations: int
    n_microgravity: int
    n_ground: int
    n_with_tables: int
    n_test_rows: int
    n_publications: int
    n_dois: int
    n_harmonized_variables: int
    harmonized_counts: dict[str, int]
    by_fuel_phase: list[FacetCount]
    by_role: list[FacetCount]
    by_platform: list[FacetCount]
    by_hardware: list[FacetCount]
    timeline: list[dict[str, Any]]
    source: str
    built_at: str
