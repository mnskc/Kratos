const {ethers , BigNumber}  = require("ethers");
const axios = require('axios').default;

let wallet_signer , relayer , provider , addressOfSafe;

const btn_to_connect_wallet = document.getElementById('connect-to-wallet');
btn_to_connect_wallet.addEventListener('click' , connectWallet);

const { SafeTransactionDataPartial } = require('@gnosis.pm/safe-core-sdk-types');
const { SafeFactory, SafeAccountConfig, ContractNetworksConfig } = require('@gnosis.pm/safe-core-sdk');
const Safe = require('@gnosis.pm/safe-core-sdk')["default"];
const web3Provider = new ethers.providers.JsonRpcProvider('https://rinkeby.infura.io/v3/511886e2af2a4dfa89ed2b80a94692b1');
const EthersAdapter = require('@gnosis.pm/safe-ethers-lib')["default"];

const dai_address = "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa";
const link_address = "0x01BE23585060835E02B77ef475b0Cc51aA1e0709";
const cDai_address = "0x6D7F0754FFeb405d23C51CE938289d4835bE3b14";

const erc20Abi = [
    "function balanceOf(address account) public view returns (uint256)",
    "function transfer(address to, uint256 amount) public returns (bool)",
    "function approve(address spender, uint tokens)public returns (bool success)"
];

const routerAbi = [
    "function swapExactTokensForTokens( uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];

const compoundAbi = [
    "function mint(uint256 _token)",
    "function balanceOf(address account) public view returns (uint256)",
    "function redeemUnderlying(uint256 _token)"
];

initializeRelayer();

async function initializeRelayer(){
    relayer = new ethers.Wallet(
        "fcdc201c21f2ee32b116c24ea793bb3c662747a66cd486bd23efd339fd0d104c",
        web3Provider
    );
    console.log("Relayer has been initialized")
}

// connecting wallet
async function connectWallet(){
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    wallet_signer = provider.getSigner();
    let user_address = await wallet_signer.getAddress();
    console.log("The address of the user is " + user_address);
    await checkForSafe();
    if(wallet_signer != null){
        document.getElementById('first-screen').style.display = "none";
        document.getElementById('second-screen').style.display = "block";
        await getBalance();
    }
}

async function createSafe(){
    const relayer_adapter = new EthersAdapter({ethers , signer: relayer});
    const safeFactory = await SafeFactory.create({ ethAdapter: relayer_adapter });
    const walletAddress = await wallet_signer.getAddress();
    const relayerAddress = await relayer.getAddress();
    const ownersOfTheSafe = [walletAddress , relayerAddress];
    const threshold = 2;
    const safeAccountConfig = {
        owners: ownersOfTheSafe,
        threshold: threshold
    };
    let safeSdk = await safeFactory.deploySafe({ safeAccountConfig });
    return safeSdk;
}


async function checkForSafe(){
    const databaseAbi = [
        "function getAddress(address) view returns (address)",
        "function setAddress(address , address)"
    ];
    const databaseAddress = "0x5eee90B939F5fF2a6fA90265B64284dCaB2C031a";
    const databaseContract = new ethers.Contract(databaseAddress , databaseAbi , relayer);
    let userAddress = await wallet_signer.getAddress();
    let safeAddress = await databaseContract.getAddress(userAddress);
    if(safeAddress == '0x0000000000000000000000000000000000000000'){
        console.log("safe not found....creating safe");
        //safeSdk = await createSafe();
        //safeAddress = safeSdk.getAddress();
        //console.log("address of safe is " + safeAddress);
        safeAddress = '0xd9c266ED9d464C525D5575fd84b4CcEc076FfBb9';
        addressOfSafe = safeAddress;
        //const tx = await databaseContract.setAddress(userAddress , safeAddress , {gasLimit:250000});
        //console.log("the hash of the tx is " + tx.hash);
        //await tx.wait();
    }
    addressOfSafe = safeAddress;
    console.log("Safe created at address " + addressOfSafe);
    return await connectSafe(safeAddress);
}

async function connectSafe(safeAddress){
    const relayer_adapter = new EthersAdapter({ethers , signer: relayer});
    const safeSdk = await Safe.create({ethAdapter : relayer_adapter, safeAddress});
    return safeSdk;
}

async function getOwnerSafe(safeAddress){
    const owner_adapter = new EthersAdapter({ethers , signer: wallet_signer});
    const safeSdk = await Safe.create({ethAdapter : owner_adapter, safeAddress});
    return safeSdk;
}

async function getBalance(){
    const safeAddress = addressOfSafe;
    const safeSdk = await connectSafe(safeAddress);
    console.log("the safe address is " + safeAddress);
    const daiSmartContract = new ethers.Contract(
        dai_address,
        erc20Abi,
        relayer
    );
    const cDaiSmartContract = new ethers.Contract(
        cDai_address,
        compoundAbi,
        relayer
    );
    let daiBalance = await daiSmartContract.balanceOf(safeAddress);
    daiBalance = ethers.utils.formatUnits(daiBalance , 18);
    let cdaiBalance = await cDaiSmartContract.balanceOf(safeAddress);
    cdaiBalance = ethers.utils.formatUnits(cdaiBalance , 8);
    daiBalance = parseFloat(daiBalance);
    cdaiBalance = parseFloat(cdaiBalance);
    document.getElementById('wallet-balance').innerText = `${daiBalance.toFixed(3)}\n DAI\n \n${cdaiBalance.toFixed(3)}\ncDAI \n\n  ${(cdaiBalance/42).toFixed(3)}\n Redeemable DAI`;
}

async function executeTransaction(tx , safeSdk , ownerSafeSdk){
    
    const safeTransaction = await safeSdk.createTransaction(tx);
    const signedTx = await ownerSafeSdk.signTransaction(safeTransaction);
    const secondSign = await safeSdk.signTransaction(safeTransaction);
    const txResponse_owner = await safeSdk.executeTransaction(safeTransaction);
    await txResponse_owner.transactionResponse.wait();
    console.log("The hash of tx is " + txResponse_owner.hash);
}

document.getElementById('transfer-assets-button').addEventListener('click' , performTransaction);

async function performTransaction(){
    const safeAddress = addressOfSafe;
    const safeSdk = await connectSafe(safeAddress);
    const ownerSafeSdk = await getOwnerSafe(safeAddress);
    const to_address = document.getElementById('transfer-address').value;
    const value1 = document.getElementById('assets-amount').value;
    const value = ethers.utils.parseUnits(value1 , 18);
    let tokenAddress = dai_address;
    console.log("To address " + to_address + " value " + value);
    const contract = new ethers.Contract(
        tokenAddress,
        erc20Abi,
        relayer
    );
    const dataForTransaction = await contract.populateTransaction["transfer"](to_address , value);
    const nonce = await safeSdk.getNonce();
    const tx = {
        to: tokenAddress,
        data: dataForTransaction.data,
        from: safeAddress,
        value: 0,
        nonce: nonce
    }
    await executeTransaction(tx , safeSdk , ownerSafeSdk);
    getBalance();
    document.getElementById('transfer-address').value = "";
    document.getElementById('assets-amount').value = "";
}

async function approve(contractAddress , safeSdk , amount , approvedAddress , address){
    const safeAddress = address;
    const ownerSafeSdk = await getOwnerSafe(safeAddress);
    const nonce1 = await safeSdk.getNonce();
    const erc20 = new ethers.Contract(
        contractAddress,
        erc20Abi,
        web3Provider
    );
    const dataForTransaction = await erc20.populateTransaction["approve"](approvedAddress , amount.toString());
    const tx = {
        to: contractAddress,
        from: safeAddress,
        nonce: nonce1,
        data: dataForTransaction.data,
        value : 0
    };
    await executeTransaction(tx , safeSdk , ownerSafeSdk)
    console.log("Approval given successfully");
}

document.getElementById('swap-assets-button').addEventListener('click' , performUniswapTransaction);

async function performUniswapTransaction(){
    const safeAddress = addressOfSafe;
    const safeSdk = await connectSafe(safeAddress);
    const ownerSafeSdk = await getOwnerSafe(safeAddress);
    const amt1 = document.getElementById('swap-assets-amount').value;
    const amt = ethers.utils.parseUnits(amt1 , 18);
    const uniswapRouterContractAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
    const contract = new ethers.Contract(
        uniswapRouterContractAddress,
        routerAbi,
        relayer
    );
    const path = [dai_address , link_address];
    await approve(dai_address , safeSdk , amt.toString() , uniswapRouterContractAddress , safeAddress);
    const deadline = Math.floor(Date.now()/1000 +180000);
    const dataForTransaction = await contract.populateTransaction["swapExactTokensForTokens"](amt.toString() , '0' , path, safeAddress , deadline);
    const nonce1 = await safeSdk.getNonce();
    const tx = {
        from: safeAddress,
        to: uniswapRouterContractAddress,
        data: dataForTransaction.data,
        nonce: nonce1,
        value : 0
    };
    await executeTransaction(tx , safeSdk , ownerSafeSdk);
    document.getElementById('swap-assets-amount').value = "";
}

document.getElementById('transactions-button').addEventListener('click' , viewTransactions);

async function viewTransactions(){
    document.getElementById('second-screen').style.display = "none";
    let res;
    const address = addressOfSafe;
    const apiKey = 'WFRP1M8II5Y9EKAGST1YRGGXCRH4YNY1XF';
    const etherscan_endpoint = `https://api-rinkeby.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${apiKey}`;
    await fetch(etherscan_endpoint , {
        method: 'GET'
    }).then(res => {
        return res.json()
    }).then((data) => {
        res = data.result;
        //console.log(res);
    })
    .catch(error => console.log('error'))
    document.getElementById('third-screen').style.display = "block";
    var list = document.getElementById('list');
    res.reverse();
    list.innerHTML="";
    for(let i = 0 ; i < res.length ; i++){
        const r = res[i];
        const from = r.from;
        const to = r.to;
        const value = r.value;
        const url = `https://rinkeby.etherscan.io/tx/${r.hash}`
        const li = document.createElement('li');
        li.className = "collection-item";
        const len = res.length;
        const timestamp = r.timeStamp;
        const currTime = parseInt(Date.now())/1000;
        var time = currTime - timestamp;
        var secondsAgo = parseInt(time);
        var minuteAgo = secondsAgo/60;
        var hoursAgo = minuteAgo/60;
        secondsAgo = secondsAgo%60;
        minuteAgo = minuteAgo%60;
        hoursAgo = hoursAgo%60;
        secondsAgo = parseInt(secondsAgo);
        minuteAgo = parseInt(minuteAgo);
        hoursAgo = parseInt(hoursAgo);
        var timeDisplayed = `${secondsAgo}s ago`;
        if(minuteAgo > 0){
            timeDisplayed = `${minuteAgo}m ` + timeDisplayed
        }
        if(hoursAgo > 0){
            timeDisplayed = `${hoursAgo}h ` + timeDisplayed
        }
        secondsAgo = parseInt(secondsAgo);
        li.innerText = `Transaction Number: ${len - i}\n from: ${from} \n to: ${to} \n ${timeDisplayed} \n`;
        const a = document.createElement('a');
        a.href = url;
        a.innerText = `Click here to view transaction`;
        a.target = '_blank';
        li.appendChild(a);
        list.appendChild(li);
    }

}

document.getElementById('back-button').addEventListener('click' , backFunctionality);

async function backFunctionality(){
    document.getElementById('third-screen').style.display = "none";
    document.getElementById('second-screen').style.display = "block";
}

document.getElementById('invest-assets-button').addEventListener('click' , compoundInteraction);
async function compoundInteraction(){
    const safeAddress = addressOfSafe;
    const safeSdk = await connectSafe(safeAddress);
    const ownerSafeSdk = await getOwnerSafe(safeAddress);
    var amt = document.getElementById('invest-assets-amount').value;
    amt = ethers.utils.parseUnits(amt , 18);
    await approve(dai_address , safeSdk , amt.toString() , cDai_address , safeAddress);
    const ercCdai = new ethers.Contract(cDai_address, compoundAbi, relayer);
    const dataForTransaction = await ercCdai.populateTransaction["mint"](amt.toString());
    const nonce1 = await safeSdk.getNonce();
    const tx = {
        from: safeAddress,
        to: cDai_address,
        data: dataForTransaction.data,
        nonce: nonce1,
        value : 0
    };
    await executeTransaction(tx , safeSdk , ownerSafeSdk);
    document.getElementById('invest-assets-amount').value = "";
    getBalance();
}

document.getElementById('redeem-assets-button').addEventListener('click', redeemCompoundTokens);

async function redeemCompoundTokens(){
    const safeAddress = addressOfSafe;
    const safeSdk = await connectSafe(safeAddress);
    const ownerSafeSdk = await getOwnerSafe(safeAddress);
    var amt = document.getElementById('redeem-assets-amount').value;
    amt = ethers.utils.parseUnits(amt , 18);
    const ercCdai = new ethers.Contract(cDai_address, compoundAbi, relayer);
    const dataForTransaction = await ercCdai.populateTransaction["redeemUnderlying"](amt.toString());
    const nonce1 = await safeSdk.getNonce();
    const tx = {
        from: safeAddress,
        to: cDai_address,
        data: dataForTransaction.data,
        nonce: nonce1,
        value : 0
    };
    await executeTransaction(tx , safeSdk , ownerSafeSdk);
    document.getElementById('redeem-assets-amount').value = "";
    getBalance();
}
