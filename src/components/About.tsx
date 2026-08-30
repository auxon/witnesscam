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
        <li>
          <strong>Yours Wallet</strong> broadcasts that receipt over BRC-100 (CWI), same stack as
          SatPress. The{" "}
          <a href="https://github.com/auxon/yours-agent">auxon/yours-agent</a> sidecar is a
          localhost fallback. Without a wallet the same script is mined locally.
        </li>
        <li>
          <strong>RFC 3161</strong> is the timestamp counsel can explain. DigiCert or Sectigo
          attest the SHA-256. Bitcoin SV is an optional public bulletin, not the clock of record.
        </li>
        <li>
          <strong>Organizations</strong> share one Pro license across field phones. Join with a
          short code. The file still never leaves the capturing device.
        </li>
      </ul>
      <p>
        This build encrypts in the browser. An RFC 3161 Time Stamp Authority attests the digest.
        If Yours Wallet is connected, a public bulletin is added on BSV. Export a printable
        certificate for counsel from any bag. The payload is always{" "}
        <code>WC1 || sha256(file) || custodyTip</code>.
      </p>
    </section>
  );
}
