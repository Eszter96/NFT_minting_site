import "./App.css";
import { useMemo } from "react";
import * as anchor from "@project-serum/anchor";
import Home from "./Home";

import { clusterApiUrl } from "@solana/web3.js";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  getPhantomWallet,
  getSlopeWallet,
  getSolflareWallet,
  getSolletWallet,
  getSolletExtensionWallet,
} from "@solana/wallet-adapter-wallets";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletDialogProvider } from "@solana/wallet-adapter-material-ui";
import { ThemeProvider, createTheme, Paper } from "@material-ui/core";
import { DEFAULT_TIMEOUT } from "./connection";
import Typography from "@material-ui/core/Typography";
import Container from "@material-ui/core/Container";
import Box from "@material-ui/core/Box";
import Grid from "@material-ui/core/Grid";
import Image from "material-ui-image";
import logo from "./assets/treedom.png";
import gif from "./assets/treedom.gif";
import leafbg from "./assets/leaf.png";

const theme = createTheme({
  palette: {
    type: "dark",
  },
});

const getCandyMachineId = (): anchor.web3.PublicKey | undefined => {
  try {
    const candyMachineId = new anchor.web3.PublicKey(
      process.env.REACT_APP_CANDY_MACHINE_ID!
    );

    return candyMachineId;
  } catch (e) {
    console.log("Failed to construct CandyMachineId", e);
    return undefined;
  }
};

const candyMachineId = getCandyMachineId();
const network = process.env.REACT_APP_SOLANA_NETWORK as WalletAdapterNetwork;
const rpcHost = process.env.REACT_APP_SOLANA_RPC_HOST!;
const connection = new anchor.web3.Connection(
  rpcHost ? rpcHost : anchor.web3.clusterApiUrl("devnet")
);

const txTimeoutInMilliseconds = 30000;

const App = () => {
  const endpoint = useMemo(() => clusterApiUrl(network), []);
  console.log(endpoint);
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
  let error: string | undefined = undefined;

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
                    paddingTop: "0px",
                    display: "flex",
                    justifyContent: "center",
                  }}
                  src={logo}
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
                  }}
                  variant="h6"
                  align="left"
                >
                  Unique way of tree adoption
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
            <Box style={{ textAlign: "center" }}>
              <Typography>{"Copyright © "}</Typography>
              <Typography
                variant="body2"
                style={{ fontWeight: "bold" }}
                display="inline"
              >
                Treedom
              </Typography>
              {" " + new Date().getFullYear()}
              {"."}
            </Box>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default App;
