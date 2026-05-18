# -*- coding: utf-8 -*-
"""FastAPI server for OutlookRegister."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import Settings, DATA_DIR
from api.routes import outlook as outlook_routes
from api.ws import register_ws

app = FastAPI(title="OutlookRegister API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3535", "file://"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": Settings.APP_VERSION}


@app.get("/api/app-info")
def app_info():
    return {
        "name": Settings.APP_NAME,
        "version": Settings.APP_VERSION,
        "data_dir": str(DATA_DIR),
    }


app.include_router(outlook_routes.router)
app.include_router(register_ws.router)


def run_server(host: str = "127.0.0.1", port: int = 8765):
    import uvicorn
    uvicorn.run(app, host=host, port=port)
