export function TutorialContent(): JSX.Element {
  return (
    <div className="tutorial">
      <p>
        Estás ante una partida de tablero inspirada en Catán. Gana quien llegue a <strong>10 puntos</strong> durante su
        propio turno.
      </p>
      <div className="tutorial-grid">
        <section>
          <h3>1. Prepara tu red</h3>
          <p>
            Coloca poblados en cruces libres respetando la distancia mínima y une cada poblado con una carretera. En la
            segunda ronda recibirás los recursos de tu nuevo poblado.
          </p>
        </section>
        <section>
          <h3>2. Produce recursos</h3>
          <p>
            Al inicio de tu turno lanza dos dados. Los poblados junto a hexágonos con ese número producen 1 recurso; las
            ciudades producen 2. El desierto y el hexágono con el ladrón no producen.
          </p>
        </section>
        <section>
          <h3>3. Construye y comercia</h3>
          <p>
            Carretera: 1 madera + 1 arcilla. Poblado: 1 madera + 1 arcilla + 1 lana + 1 trigo. Ciudad: 2 trigo + 3
            mineral. Carta: 1 lana + 1 trigo + 1 mineral. También puedes cambiar recursos con el banco o negociar con
            otros jugadores.
          </p>
        </section>
        <section>
          <h3>4. Cuidado con el 7</h3>
          <p>
            Con un 7 nadie produce: quienes tengan más de 7 recursos descartan la mitad y el jugador activo mueve al
            ladrón y roba una carta a un rival adyacente si puede.
          </p>
        </section>
        <section>
          <h3>5. Explora y captura</h3>
          <p>
            Cada hexágono muestra un Pokémon salvaje. Si tienes un poblado o ciudad junto a su bioma, puedes capturarlo
            pagando su coste. Solo puedes mantener 3 Pokémon activos y capturar uno por turno.
          </p>
        </section>
        <section>
          <h3>6. Evoluciona y usa habilidades</h3>
          <p>
            Algunos Pokémon evolucionan pagando recursos. Sus habilidades pueden dar recursos, reducir costes, proteger
            del ladrón o mejorar intercambios. Revisa su frecuencia: las pasivas se activan solas.
          </p>
        </section>
        <section>
          <h3>7. Honores y cartas</h3>
          <p>
            La Ruta Comercial más larga (5+ carreteras) y el Ejército más grande (3+ caballeros) dan 2 puntos cada uno.
            Las cartas de desarrollo compradas no se pueden jugar el mismo turno.
          </p>
        </section>
        <section>
          <h3>8. Guarda y continúa</h3>
          <p>
            La partida se guarda automáticamente en este navegador. Usa el menú de pausa para exportar el JSON,
            importarlo en otro dispositivo o empezar de nuevo.
          </p>
        </section>
      </div>
      <p className="tutorial-note">
        Proyecto de aficionados no oficial. Pokémon y sus nombres pertenecen a sus titulares. Los retratos proceden de
        PMDCollab/SpriteCollab con licencia CC BY-NC 4.0.
      </p>
    </div>
  );
}
