const socket = io();
let localStream;
let peerConnection;
const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const btnStart = document.getElementById("btn-start");
const btnView = document.getElementById("btn-view");
const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");

// Función para crear una nueva conexión RTC
function createPeerConnection() {
  const pc = new RTCPeerConnection(config);

  pc.oniceconnectionstatechange = () => {
    console.log("Estado de conexión ICE:", pc.iceConnectionState);
    if (pc.iceConnectionState === "failed") {
      console.error("Conexión ICE fallida. Reiniciando ICE...");
      pc.restartIce(); // Reinicia ICE si es necesario
    }
  };

  pc.onconnectionstatechange = () => {
    console.log("Estado de conexión:", pc.connectionState);
    if (pc.connectionState === "failed") {
      console.error("Conexión fallida. Verifica los candidatos ICE y la red.");
    }
  };

  pc.onnegotiationneeded = async () => {
    try {
      console.log("Negociación requerida.");
      const offer = await pc.createOffer({ iceRestart: true }); // Reinicio ICE seguro
      await pc.setLocalDescription(offer);
      socket.emit("signal", { type: "offer", offer });
      console.log("Oferta renegociada enviada.");
    } catch (error) {
      console.error("Error al manejar la negociación:", error);
    }
  };

  pc.ontrack = (event) => {
    if (!remoteVideo.srcObject) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  pc.onicegatheringstatechange = () => {
    console.log("Estado de recolección ICE:", pc.iceGatheringState);
  };

  return pc;
}

// Función para iniciar como emisor
btnStart.addEventListener("click", async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;

    peerConnection = createPeerConnection();

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", { type: "candidate", candidate: event.candidate });
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("signal", { type: "offer", offer });
    console.log("Oferta enviada.");
  } catch (error) {
    console.error("Error al acceder a la cámara o micrófono:", error);
  }
});

// Función para iniciar como receptor
btnView.addEventListener("click", () => {
  peerConnection = createPeerConnection();

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { type: "candidate", candidate: event.candidate });
    }
  };

  socket.on("signal", async (data) => {
    try {
      if (data.type === "offer") {
        if (peerConnection.signalingState !== "stable") {
          console.warn("Estado no estable, oferta ignorada.");
          return;
        }

        console.log("Oferta recibida, estableciendo conexión...");
        await peerConnection.setRemoteDescription(data.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("signal", { type: "answer", answer });
        console.log("Respuesta enviada.");
      } else if (data.type === "answer") {
        console.log("Respuesta recibida.");
        await peerConnection.setRemoteDescription(data.answer);
      } else if (data.type === "candidate") {
        try {
          await peerConnection.addIceCandidate(data.candidate);
          console.log("Candidato ICE agregado.");
        } catch (err) {
          console.error("Error al agregar candidato ICE:", err);
        }
      }
    } catch (error) {
      console.error("Error al manejar señal:", error);
    }
  });
});
