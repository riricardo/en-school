# Dependências do áudio

- @mintplex-labs/piper-tts-web 1.0.5 — MIT; https://github.com/Mintplex-Labs/piper-tts-web
- ONNX Runtime Web 1.18.0 — MIT; https://github.com/microsoft/onnxruntime
- @diffusionstudio/piper-wasm 1.0.0 — MIT, conforme o pacote npm; https://github.com/diffusion-studio/piper-wasm
- Voz en_GB-alan-medium: https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_GB/alan/medium

Os binários do motor são copiados dos pacotes npm durante o build. O modelo da voz é baixado do distribuidor original pelo navegador, sem ser incluído no ZIP ou no git.
O build aplica adaptações pequenas à biblioteca: uma thread para funcionar em hospedagem estática, endpoint oficial de vozes, verificação de status HTTP e carregamento do arquivo de fonemas pelo cache local.
