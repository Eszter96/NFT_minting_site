import "./App.css";
import { useMemo } from "react";
import * as anchor from "@project-serum/anchor";
import Home from "./Home";
import { DEFAULT_TIMEOUT } from "./connection";
import { clusterApiUrl } from "@solana/web3.js";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  getPhantomWallet,
  getSlopeWallet,
  getSolflareWallet,
  getSolletExtensionWallet,
  getSolletWallet,
} from "@solana/wallet-adapter-wallets";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletDialogProvider } from "@solana/wallet-adapter-material-ui";

import { createTheme, ThemeProvider, Paper } from "@material-ui/core";
import Typography from "@material-ui/core/Typography";
import Container from "@material-ui/core/Container";
import Box from "@material-ui/core/Box";
import Grid from "@material-ui/core/Grid";
import Image from "material-ui-image";

import LOGO from "./assets/treedom.png";
import gif from "./assets/treedom.gif";
import leafbg from "./assets/leaf.png";

const theme = createTheme({
  palette: {
    type: "dark",
  },
});

const getCandyMachineId = (): anchor.web3.PublicKey | undefined => {
  try {
    return new anchor.web3.PublicKey(process.env.REACT_APP_CANDY_MACHINE_ID!);
  } catch (e) {
    console.log("Failed to construct CandyMachineId", e);
    return undefined;
  }
};

let error: string | undefined = undefined;

if (process.env.REACT_APP_SOLANA_NETWORK === undefined) {
  error =
    "Your REACT_APP_SOLANA_NETWORK value in the .env file doesn't look right! The options are devnet and mainnet-beta!";
} else if (process.env.REACT_APP_SOLANA_RPC_HOST === undefined) {
  error =
    "Your REACT_APP_SOLANA_RPC_HOST value in the .env file doesn't look right! Make sure you enter it in as a plain-text url (i.e., https://metaplex.devnet.rpcpool.com/)";
}

const candyMachineId = getCandyMachineId();
const network = (process.env.REACT_APP_SOLANA_NETWORK ??
  "devnet") as WalletAdapterNetwork;
const rpcHost =
  process.env.REACT_APP_SOLANA_RPC_HOST ?? anchor.web3.clusterApiUrl("devnet");
const connection = new anchor.web3.Connection(rpcHost);

const App = () => {
  const endpoint = useMemo(() => clusterApiUrl(network), []);

  const wallets = useMemo(
    () => [
      getPhantomWallet(),
      getSolflareWallet(),
      getSlopeWallet(),
      getSolletWallet({ network }),
      getSolletExtensionWallet({ network }),
    ],
    []
  );

  function Copyright() {
    return (
      <Typography variant="body2" style={{ textAlign: "center" }}>
        Copyright ©<b style={{ fontWeight: "bold" }}> Treedom</b>
        {" " + new Date().getFullYear()}
      </Typography>
    );
  }
  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
        <Grid
          container
          justifyContent="center"
          style={{
            flex: 1,
            display: "flex",
          }}
        >
          <Grid
            item
            xs={12}
            md={6}
            style={{ display: "flex", alignItems: "center" }}
          >
            <Grid>
              <Grid item lg={12} md={12}>
                <Image
                  color="transparent"
                  className="logo"
                  aspectRatio={1}
                  style={{
                    position: "relative",
                    paddingTop: "0px",
                    display: "flex",
                    justifyContent: "center",
                  }}
                  src={LOGO}
                />
              </Grid>
              <Grid
                item
                lg={12}
                md={12}
                style={{
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <Typography
                  style={{
                    color: "grey",
                    width: "50%",
                    justifyContent: "center",
                    marginLeft: "10%",
                    textTransform: "lowercase",
                    paddingRight: "80px",
                    fontWeight: "bold"
                  }}
                  variant="body2"
                  align="right"
                >
                  a unique way of tree adoption
                </Typography>
              </Grid>
              <Grid item lg={12} md={12}>
                <Image
                  style={{
                    marginTop: "20px",
                    paddingTop: "0px",
                    display: "flex",
                    justifyContent: "center",
                  }}
                  color="transparent"
                  className="gif"
                  aspectRatio={1}
                  src={gif}
                />
              </Grid>
            </Grid>
          </Grid>
          <Grid
            item
            xs={12}
            md={6}
            style={{
              display: "flex",
            }}
          >
            <Paper
              style={{
                width: "100%",
                backgroundColor: "transparent",
                backgroundImage: `url(${leafbg})`,
                backgroundSize: "cover",
              }}
            >
              <Box
                style={{
                  height: "100%",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <ConnectionProvider endpoint={endpoint}>
                  <WalletProvider wallets={wallets} autoConnect>
                    <WalletDialogProvider>
                      <Home
                        candyMachineId={candyMachineId}
                        connection={connection}
                        txTimeout={DEFAULT_TIMEOUT}
                        rpcHost={rpcHost}
                        network={network}
                        error={error}
                      />
                    </WalletDialogProvider>
                  </WalletProvider>
                </ConnectionProvider>
              </Box>
            </Paper>
          </Grid>
        </Grid>
        <Box className="divider"></Box>
        <Box
          component="footer"
          sx={{
            py: 1,
            px: 2,
            mt: "auto",
          }}
          style={{ backgroundColor: "#151A1F", color: "grey" }}
        >
          <Container maxWidth="sm">
            <Copyright />
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default App;
