from fastapi import FastAPI, UploadFile, File, Query
import tempfile

from .settings import load_settings
from .model_loader import load_model_and_processor
from .pipeline import process_file


app = FastAPI(title="OCR Service")


@app.on_event("startup")
def startup():
    settings = load_settings()   # reads config.yaml
    cfg = settings.cfg

    model, processor, device, eos_id, pad_id = load_model_and_processor(
        model_name=settings.model_name,
        trust_remote_code=settings.trust_remote_code,
        device_preference=cfg["runtime"].get("device_preference", "auto"),
    )

    app.state.cfg = cfg
    app.state.model = model
    app.state.processor = processor
    app.state.device = device
    app.state.eos_id = eos_id
    app.state.pad_id = pad_id


@app.get("/")
def root():
    return {"message": "OCR Service is running"}


@app.post("/ocr")
async def ocr_endpoint(
    quality: str = Query(default="fast"),
    file: UploadFile = File(...),
):
    suffix = "." + file.filename.split(".")[-1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    return process_file(
        tmp_path,
        cfg=app.state.cfg,
        model=app.state.model,
        processor=app.state.processor,
        device=app.state.device,
        eos_id=app.state.eos_id,
        pad_id=app.state.pad_id,
        quality=quality,
    )
