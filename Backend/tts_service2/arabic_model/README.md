# Arabic Model

Egyptian Arabic model used by `tts_service2`.

Runtime setup:

- Regular Chatterbox multilingual runtime from `ResembleAI/chatterbox`
- AliAbdallah Egyptian Arabic Chatterbox checkpoint:
  `AliAbdallah/egyptian-arabic-tts-chatterbox/model.safetensors`
- Dahih LoRA adapter:
  `YomnaGharib/namaa-dahih-egyptian-lora/latest`
- Speaker reference:
  `reference.wav`

Large model files are intentionally kept in the shared cache:

```text
models_cache/namaa_dahih_lora_hf
```

