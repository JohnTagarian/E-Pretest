


from langchain_pymupdf4llm import PyMuPDF4LLMLoader

file_path = "data/Ch1.pdf"

loader = PyMuPDF4LLMLoader(file_path)

documents = loader.load()


print(type(documents))
print(len(documents))

markdown_document = []
for i,doc in enumerate(documents):
    page_number = doc.metadata.get("page", i + 1)
    markdown_content = doc.page_content
    markdown_document.append(markdown_content)

    print(markdown_content)


with open("Ch1_markdown.md","w") as f:
    f.write("\n".join(markdown_document))
print("Success")


