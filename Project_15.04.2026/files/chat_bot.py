from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key="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")


@app.get("/ask")
async def ask_ai(question: str):
    try:
        # Прямое использование метода из вашей документации
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": question,
                }
            ],
            model="llama-3.3-70b-versatile",
        )

        return {"answer": chat_completion.choices[0].message.content}

    except Exception as e:
        return {"error": str(e)}

