export function About() {
  return (
    <section className="about">
      <p className="kicker">Why this exists</p>
      <h2>Chain of custody is not a watermark.</h2>
      <p className="lede">
        WitnessCam is the first slice of a product only a handful of people are positioned to
        finish: DNA-lab sample tracking, field-level medical encryption, blockchain document
        seals, and Bitcoin timestamps — in one capture loop.
      </p>
      <ul className="lineage">
        <li>
          <strong>STaCS DNA</strong> taught the metaphor. A sample is not “stored.” It is
          received, hashed into identity, and handed from holder to holder. Break the log and
          the evidence is junk.
        </li>
        <li>
          <strong>TrialStat field encryption</strong> taught the threat. Sensitive bytes are
          encrypted on the client. The server is not a vault. It is untrusted infrastructure.
        </li>
        <li>
          <strong>TITUS + BSV</strong> taught the public commitment. A hash in an OP_RETURN is
          a receipt the world can keep even when the file stays dark.
        </li>
      </ul>
      <p>
        This build runs entirely in your browser. The miner is a local demo so you can feel the
        loop without a wallet. The script it produces is a real OP_RETURN payload:{" "}
        <code>WC1 || sha256(file) || custodyTip</code>.
      </p>
    </section>
  );
}
