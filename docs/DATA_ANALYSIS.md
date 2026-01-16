# Data Analysis & Understanding

## Datasets Overview

We have 4 core datasets from the MoSPI MPLADS API.

### 1. Allocated Limit (`allocated_limit.json`)
*   **Purpose:** Shows the total funds allocated to each MP.
*   **Key Fields:** `MP_NAME`, `CONSTITUENCY`, `STATE_NAME`, `ALLOCATED_AMT`.
*   **Grain:** One record per MP.
*   **Volume:** ~544 records.

### 2. Works Recommended (`total_works_recommended.json`)
*   **Purpose:** The master list of all projects proposed by MPs.
*   **Key Fields:** 
    *   `WORK_RECOMMENDATION_DTL_ID` (Primary Key)
    *   `RECOMMENDED_AMOUNT`
    *   `WORK_DESCRIPTION`
    *   `RECOMMENDATION_DATE`
    *   `IDA_NAME` (District Authority)
*   **Grain:** One record per proposed work.
*   **Volume:** ~73,700 records.

### 3. Total Expenditure (`total_expenditure.json`)
*   **Purpose:** Tracks actual money released/spent for works.
*   **Key Fields:**
    *   `WORK_RECOMMENDATION_DTL_ID` (Foreign Key to Recommended)
    *   `FUND_DISBURSED_AMT`
    *   `VENDOR_NAME`
    *   `EXPENDITURE_DATE`
*   **Grain:** Transaction level (multiple per work).
*   **Volume:** ~43,700 records.

### 4. Works Completed (`total_works_completed.json`)
*   **Purpose:** Tracks works that are officially marked as done.
*   **Key Fields:**
    *   `WORK_RECOMMENDATION_DTL_ID` (Foreign Key)
    *   `ACTUAL_AMOUNT`
    *   `ACTUAL_END_DATE`
    *   `ATTACH_ID` (Proof of completion)
*   **Grain:** One record per completed work.
*   **Volume:** ~11,000 records.

## Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    MP ||--o{ WORK_RECOMMENDED : proposes
    MP {
        string MP_NAME
        string CONSTITUENCY
        string STATE_NAME
        float ALLOCATED_AMT
    }

    WORK_RECOMMENDED ||--o{ EXPENDITURE : "funds released"
    WORK_RECOMMENDED ||--|| WORK_COMPLETED : "finishes as"

    WORK_RECOMMENDED {
        int WORK_RECOMMENDATION_DTL_ID PK
        string WORK_DESCRIPTION
        float RECOMMENDED_AMOUNT
        date RECOMMENDATION_DATE
    }

    EXPENDITURE {
        int TRANSACTION_ID PK
        int WORK_RECOMMENDATION_DTL_ID FK
        float FUND_DISBURSED_AMT
        string VENDOR_NAME
        date EXPENDITURE_DATE
    }

    WORK_COMPLETED {
        int WORK_RECOMMENDATION_DTL_ID FK
        float ACTUAL_AMOUNT
        date ACTUAL_END_DATE
        int ATTACH_ID "Proof Document ID"
    }
```

## Critical Metrics to Compute

1.  **Utilization Rate:** `Total Expenditure / Allocated Amount` (per MP).
2.  **Completion Rate:** `Count(Works Completed) / Count(Works Recommended)` (per MP).
3.  **Transparency Score:** `% of Completed Works with ATTACH_ID` (per MP).
4.  **Vendor Concentration:** Top vendors receiving funds per Constituency.
5.  **Cost Efficiency:** `ACTUAL_AMOUNT` vs `RECOMMENDED_AMOUNT` delta.

## Data Strategy
*   **Storage:** SQLite (single file `govwork.db`).
*   **ETL:** Python script to load JSONs, clean types, and normalize into SQL tables.
*   **Caching:** The database *is* the cache. ETL runs only when we explicitly fetch fresh data.
