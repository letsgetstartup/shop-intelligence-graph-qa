# Shop Intelligence Graph Q&A

A production-ready intelligence layer for manufacturing organizations that transforms operational data into an interactive Knowledge Graph. Powered by **FalkorDB** and **Google Gemini 2.5 Pro**, it enables stakeholders to extract actionable insights using natural language.

## 🚀 Key Features

- **Natural Language Q&A**: Translates business questions (e.g., "Which jobs are at risk of being late?") into precise Cypher queries.
- **Shop-Floor Knowledge Graph**: Models Jobs, Parts, Machines, Customers, and Operations as a property graph for deep relational analysis.
- **In-Database KPIs**: Support for specialized metrics like downtime cost, scrap cost, and late delivery risk scoring via UDFs.
- **Intelligent Suggestions**: Provides guided follow-up questions to deepen operational analysis.
- **Enterprise-Grade Stack**: Built with Fastify, LangChain, and Google Vertex AI (Gemini 2.5 Pro).

## 🛠 Tech Stack

- **Database**: [FalkorDB](https://www.falkordb.com/) (Redis-compatible Graph DB)
- **LLM**: Google Gemini 2.5 Pro (via Google Vertex AI)
- **Framework**: [Fastify](https://www.fastify.io/) & [LangChain](https://js.langchain.com/)
- **Runtime**: Node.js 18+

## 📦 Getting Started

### Prerequisites

- Node.js installed on your local machine.
- An active FalkorDB instance (Cloud or Local Docker).
- A Google Cloud Project with Vertex AI enabled and an API Key.

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd falkordb
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

### Data Ingestion

Populate the graph database from existing CSV exports:
```bash
node ingest/ingest.js
```

### Running the API

Start the intelligence service:
```bash
npm start
```
The server will be available at `http://localhost:8080`.

## 📂 Project Structure

- `ingest/`: Automated ingestion pipeline for manufacturing CSV datasets.
- `src/`: Core API service and LangChain logic.
- `udf/`: In-database JavaScript User Defined Functions for high-performance KPI calculations.
- `data/`: Placeholder for manufacturing datasets (ERP/MES exports).

## 🔒 Security Best Practices

- **Credential Management**: sensitive keys are managed via `.env` (excluded from version control).
- **Read-Only Queries**: The AI service is configured to execute only read-safe Cypher queries.
- **Input Sanitization**: Leveraging LangChain's safe Cypher generation patterns.

## 📄 License

This project is licensed under the MIT License.
