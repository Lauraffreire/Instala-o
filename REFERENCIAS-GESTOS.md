# Adaptação dos projetos fornecidos

Os dois ZIP foram lidos como referência; não foram executados nem alterados. A adaptação modifica apenas a aplicação em `instalacao/`.

## Arquivo de memórias

Consultados `index.html` e `script.js`.

- `processarResultadosMao`: cursor espelhado pela ponta do indicador, suavização de 0,18 e zona morta de 0,004. Adaptado para a instalação com compensação pelo intervalo entre frames, para não depender de uma taxa fixa.
- `detectarGestos`: histórico de posições, mínimo de cinco amostras, comparação entre deslocações horizontal e vertical e limiar horizontal de 0,18. Adaptado para a palma da mão aberta, até oito amostras em 700 ms e predominância horizontal de 1,2 vezes. A instalação espera que o movimento termine ou a mão mude de postura antes de aceitar outro deslize.
- `iniciarDeteccaoMaos`: confianças de deteção 0,65 e acompanhamento 0,6. Adaptadas às opções equivalentes de HandLandmarker.
- `verificarTodosBotoes`: confirmação por permanência, progresso circular e reposição ao sair do alvo. A instalação já tinha este mecanismo e conserva o intervalo de 1,3 segundos, com disparo único até retirar o indicador.

O projeto original também usa palavras reconhecidas pelo microfone para fotografar: não é exclusivamente gestual. Captura de imagem, reconhecimento de voz, filtros e gestão da galeria não foram importados.

## BetweenLines

Consultados `index.html`, `js/config.js`, `js/standby.js`, `js/standby_mp.js`, `js/forms.js` e `js/graph.js`.

- `standby_mp.js`: deteção da pessoa por pose, com ombros e ancas. Adaptada para substituir a deteção apenas pelo rosto na instalação. Dois pontos do tronco visíveis e dentro do enquadramento mantêm a presença mesmo com as mãos baixas.
- `forms.js`: consideração da confiança de visibilidade dos ombros (0,3), agora aplicada aos pontos do tronco usados para presença.
- Confianças de deteção e acompanhamento de pose: 0,4. Mantidas no modelo PoseLandmarker Lite, analisado a cada 500 ms.
- Uma única câmara partilhada pelos modelos de mão e corpo, sem pedir microfone.

BetweenLines usa sobretudo posição corporal e permanência em zonas; não contém o gesto de agarrar um livro e puxar. O atraso de cinco segundos para sair do standby, a segmentação da silhueta e as zonas do questionário não foram importados porque a instalação começa com a deteção de uma mão e mantém a sua própria navegação.

## Limites

Os projetos usam APIs MediaPipe anteriores (`Hands`, `Pose`, `Camera`); a instalação conserva Tasks Vision e adapta a lógica em vez de carregar duas versões das bibliotecas. A API atual de pose foi confirmada na documentação oficial: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js

O gesto de fechar e puxar, a prioridade entre várias mãos e a ampliação por dedos continuam a exigir ensaios na câmara da instalação. Os valores herdados são pontos de partida, não uma calibração comprovada no novo contexto. Os testes automáticos usam movimentos sintéticos e não comprovam reconhecimento por câmara.
