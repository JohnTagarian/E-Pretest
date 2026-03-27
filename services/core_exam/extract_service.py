from __future__ import annotations

from pathlib import Path


def extract_pdf_to_markdown(pdf_path: str) -> str:
    try:
        from langchain_pymupdf4llm import PyMuPDF4LLMLoader
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing dependency: langchain-pymupdf4llm. Install requirements-backend.txt first."
        ) from exc

    loader = PyMuPDF4LLMLoader(pdf_path)
    documents = loader.load()
    markdown_pages = [doc.page_content for doc in documents]
    return "\n\n".join(markdown_pages)


def extract_and_save_markdown(pdf_path: str, output_md_path: str) -> dict:
    markdown_text = extract_pdf_to_markdown(pdf_path)

    out = Path(output_md_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(markdown_text, encoding="utf-8")

    return {
        "status": "success",
        "output_path": str(out),
        "num_chars": len(markdown_text),
    }
