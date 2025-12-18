/*
  SynapSense ESP32 Wireless Tracker (High-Performance TDOA Edition)
  
  This firmware is optimized for 1kHz sampling (minimum required for TDOA).
  It creates a WiFi Access Point "SynapSense-Gateway" and serves data via WebSockets.
  
  IP: 192.168.4.1
  Port: 81
  Format: "CH1:vvvv CH2:vvvv CH3:vvvv CH4:vvvv"
*/

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <WebServer.h>

// ---------- WiFi Configuration ----------
const char* ssid     = "Pranshul";
const char* password = "Pranshul@007"; 

WebSocketsServer webSocket = WebSocketsServer(81);
WebServer server(80); // Added for connectivity check

// ---------- Pin Definitions ----------
const int piezoPins[4] = {33, 32, 35, 34};
const bool channelActive[4] = {true, true, true, true};

unsigned long lastMicros = 0;
const unsigned long sampleInterval = 1000; // 1kHz

void handleRoot() {
  server.send(200, "text/plain", "SynapSense ESP32 Gateway - Online");
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  if (type == WStype_CONNECTED) {
    Serial.printf("[%u] Client Connected\n", num);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  WiFi.softAP(ssid, password);
  Serial.print("Gateway IP: ");
  Serial.println(WiFi.softAPIP());

  // Connectivity check page
  server.on("/", handleRoot);
  server.begin();

  webSocket.begin();
  webSocket.onEvent(webSocketEvent);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  
  for (int i = 0; i < 4; i++) pinMode(piezoPins[i], INPUT);
  Serial.println("Wireless System Ready");
}

void loop() {
  server.handleClient();
  webSocket.loop();

  unsigned long currentMicros = micros();
  if (currentMicros - lastMicros >= sampleInterval) {
    lastMicros = currentMicros;

    char buf[64];
    snprintf(buf, sizeof(buf), "CH1:%d CH2:%d CH3:%d CH4:%d", 
             analogRead(piezoPins[0]), analogRead(piezoPins[1]), 
             analogRead(piezoPins[2]), analogRead(piezoPins[3]));

    webSocket.broadcastTXT(buf);
  }
  
  // Critical for ESP32 WiFi stability during high-freq broadcast
  yield(); 
}
