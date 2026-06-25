# English Model

Regular Chatterbox English model used by `tts_service2`.

Runtime setup:

- Model repo: `ResembleAI/chatterbox`
- Runtime class: `chatterbox.tts.ChatterboxTTS`
- Voice: built-in default voice from Chatterbox unless `TTS_ENGLISH_REFERENCE_WAV`
  points to a custom reference WAV.

The model is downloaded at runtime into:

```text
english_model/cache
```

Large model files are not committed in this folder.
