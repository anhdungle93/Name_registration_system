const { expect } = require("chai");
const hre = require("hardhat");
const { utils } = require("ethers");


const chai = require('chai');
const BN = require('bn.js');
 
//use default BigNumber
chai.use(require('chai-bn')(BN));

async function getCurrentBlock(provider) {
    let currentBlockNumber = await provider.getBlockNumber();
    let currentBlock = await provider.getBlock(currentBlockNumber);

    // loop to avoid provider.getBlockNumber caching bug
    while (currentBlock === null && currentBlockNumber >= 0) {
        currentBlockNumber--;
        currentBlock = await provider.getBlock(currentBlockNumber);
    }

    return currentBlock;
}

describe("NameSystem", () => {
    let deployer, user1, user2;
    let pricePerByte = 100;
    let validityPeriod = 604800;
    let NameSystem

    beforeEach(async () => {
        [ deployer, user1, user2] = await hre.ethers.getSigners();
        
        const NameSystemFactory = await hre.ethers.getContractFactory("NameSystem", deployer);
        NameSystem = await NameSystemFactory.deploy();
    });

    it('user has to commit before name registration', async () => {
        let name = "test";
        let price = name.length * pricePerByte;
        let salt = 5;

        //checks that it reverts
        await expect(NameSystem.connect(user1).registerName(name, salt, {value: price}))
            .to.be.revertedWith("NameSystem: user hasn't commited to this name yet.");
    });

    it('user can register a new name', async () => {
        let name = "test";
        let price = name.length * pricePerByte;
        let salt = 5;
        let zeroAddress = "0x0000000000000000000000000000000000000000";

        let abiCoder = utils.defaultAbiCoder;
        let secret = utils.keccak256(abiCoder.encode([ "uint", "string" ], [ salt, name ]));

        await NameSystem.connect(user1).commit(secret);

        // check that the commit is recorded
        expect(await NameSystem.commitments(user1.address, secret)).to.be.equal(true);
        
        let provider = hre.ethers.provider;
        let currentBlock = await getCurrentBlock(provider);
        let nextBlockTimestamp = currentBlock.timestamp + 100;
        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp])


        // check event
        await expect(NameSystem.connect(user1).registerName(name, salt, {value: price})).to.emit(NameSystem, "Registration").withArgs(user1.address, zeroAddress, name, nextBlockTimestamp + validityPeriod);

        // check that the nameinfo is updated accordingly
        let nameHash = utils.keccak256(utils.toUtf8Bytes(name));
        let nameInfo = await NameSystem.names(nameHash);

        expect(nameInfo.owner).to.be.equal(user1.address);
        expect(nameInfo.validUntil).to.be.equal(nextBlockTimestamp + validityPeriod);
    });

    it('user needs to lock enough ETH to register the name', async () => {
        let name = "test";
        let price = name.length * pricePerByte;
        let salt = 5;

        let abiCoder = utils.defaultAbiCoder;
        let secret = utils.keccak256(abiCoder.encode([ "uint", "string" ], [ salt, name ]));

        await NameSystem.connect(user1).commit(secret);

        // check event
        await expect(NameSystem.connect(user1).registerName(name, salt, {value: price / 2}))
                .to.be.revertedWith("NameSystem: not enough balance to reserve name.");
    });

    it('user is charged correctly', async () => {
        let name = "test";
        let price = name.length * pricePerByte;
        let salt = 5;
        let zeroAddress = "0x0000000000000000000000000000000000000000";

        let abiCoder = utils.defaultAbiCoder;
        let secret = utils.keccak256(abiCoder.encode([ "uint", "string" ], [ salt, name ]));

        await NameSystem.connect(user1).commit(secret);
        
        let provider = hre.ethers.provider;
        let currentBlock = await getCurrentBlock(provider);
        let nextBlockTimestamp = currentBlock.timestamp + 100;
        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp])

        let user1BalanceBeforeRegistration = await provider.getBalance(user1.address);
        let nameSystemBalanceBeforeRegistration = await provider.getBalance(NameSystem.address);

        // we sent more than price expecting it to be returned back
        let registrationTxn = await NameSystem.connect(user1).registerName(name, salt, {value: price + 120});
        let registrationReceipt = await provider.getTransactionReceipt(registrationTxn.hash);
        let gasCost = registrationReceipt.gasUsed * registrationReceipt.effectiveGasPrice;


        let user1BalanceAfterRegistration = await provider.getBalance(user1.address);
        let nameSystemBalanceAfterRegistration = await provider.getBalance(NameSystem.address);

        expect(nameSystemBalanceAfterRegistration).to.be.equal(nameSystemBalanceBeforeRegistration.add(price));
        expect(user1BalanceAfterRegistration).to.be.equal(user1BalanceBeforeRegistration.sub(price).sub(gasCost));
    });

    it('user cannot register name if it still belongs to someone', async () => {
        let name = "test";
        let price = name.length * pricePerByte;
        let salt = 5;
        let zeroAddress = "0x0000000000000000000000000000000000000000";

        let abiCoder = utils.defaultAbiCoder;
        let secret = utils.keccak256(abiCoder.encode([ "uint", "string" ], [ salt, name ]));

        await NameSystem.connect(user1).commit(secret);
        
        let provider = hre.ethers.provider;
        let currentBlock = await getCurrentBlock(provider);
        let nextBlockTimestamp = currentBlock.timestamp + 100;
        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp])

        await NameSystem.connect(user1).registerName(name, salt, {value: price + 120});

        await NameSystem.connect(user2).commit(secret);
        
        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp + (validityPeriod / 2)]);

        await expect(NameSystem.connect(user2).registerName(name, salt, {value: price}))
                .to.be.revertedWith("NameSystem: name still belongs to someone.");
    });

    it('user cannot register name if it still belongs to someone', async () => {
        let name = "test";
        let price = name.length * pricePerByte;
        let salt = 5;
        let zeroAddress = "0x0000000000000000000000000000000000000000";

        let abiCoder = utils.defaultAbiCoder;
        let secret = utils.keccak256(abiCoder.encode([ "uint", "string" ], [ salt, name ]));

        await NameSystem.connect(user1).commit(secret);
        
        let provider = hre.ethers.provider;
        let currentBlock = await getCurrentBlock(provider);
        let nextBlockTimestamp = currentBlock.timestamp + 100;
        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp])

        await NameSystem.connect(user1).registerName(name, salt, {value: price + 120});

        await NameSystem.connect(user2).commit(secret);
        
        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp + (validityPeriod / 2)]);

        await expect(NameSystem.connect(user2).registerName(name, salt, {value: price}))
                .to.be.revertedWith("NameSystem: name still belongs to someone.");
    });

    it('name with expired registration can be registered by someone else', async () => {
        let name = "test";
        let price = name.length * pricePerByte;
        let salt = 5;
        let zeroAddress = "0x0000000000000000000000000000000000000000";

        let abiCoder = utils.defaultAbiCoder;
        let secret = utils.keccak256(abiCoder.encode([ "uint", "string" ], [ salt, name ]));

        await NameSystem.connect(user1).commit(secret);
        
        let provider = hre.ethers.provider;
        let currentBlock = await getCurrentBlock(provider);
        let nextBlockTimestamp = currentBlock.timestamp + 100;
        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp])

        await NameSystem.connect(user1).registerName(name, salt, {value: price});

        await NameSystem.connect(user2).commit(secret);

        // set time so that the name registration period would expire
        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp + validityPeriod + 10])

        await expect(NameSystem.connect(user2).registerName(name, salt, {value: price}))
                .to.emit(NameSystem, "Registration").withArgs(user2.address, user1.address, name, nextBlockTimestamp + validityPeriod * 2 + 10);
        
        // check that the nameinfo is updated accordingly
        let nameHash = utils.keccak256(utils.toUtf8Bytes(name));
        let nameInfo = await NameSystem.names(nameHash);

        expect(nameInfo.owner).to.be.equal(user2.address);
        expect(nameInfo.validUntil).to.be.equal(nextBlockTimestamp + validityPeriod * 2 + 10);
            
        expect (await NameSystem.refunds(user1.address)).to.be.equal(price);

        let user1BalanceBeforeRefund = await provider.getBalance(user1.address);

        let refundTxn = await NameSystem.connect(user1).refund();
        let refundReceipt = await provider.getTransactionReceipt(refundTxn.hash);
        let gasCost = refundReceipt.gasUsed * refundReceipt.effectiveGasPrice;

        let user1BalanceAfterRefund = await provider.getBalance(user1.address);
        expect(user1BalanceAfterRefund).to.be.equal(user1BalanceBeforeRefund.sub(gasCost).add(price));
    });

    it('user (and only him) can extend his name registration', async () => {
        let name = "test";
        let price = name.length * pricePerByte;
        let salt = 5;

        let abiCoder = utils.defaultAbiCoder;
        let secret = utils.keccak256(abiCoder.encode([ "uint", "string" ], [ salt, name ]));

        await NameSystem.connect(user1).commit(secret);
        
        let provider = hre.ethers.provider;
        let currentBlock = await getCurrentBlock(provider);
        let nextBlockTimestamp = currentBlock.timestamp + 100;
        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp])

        await NameSystem.connect(user1).registerName(name, salt, {value: price});

        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp + 100]);


        await expect(NameSystem.connect(user1).extendRegistration(name))
                .to.emit(NameSystem, "Extension").withArgs(user1.address, name, nextBlockTimestamp + validityPeriod + 100);

        // check that the nameinfo is updated accordingly
        let nameHash = utils.keccak256(utils.toUtf8Bytes(name));
        let nameInfo = await NameSystem.names(nameHash);

        expect(nameInfo.owner).to.be.equal(user1.address);
        expect(nameInfo.validUntil).to.be.equal(nextBlockTimestamp + validityPeriod + 100);
        

        // only user1 can extend the registration
        await expect(NameSystem.connect(user2).extendRegistration(name))
            .to.be.revertedWith("NameSystem: the name currently doesn't belong to user.");
    });

    it('name registration can be forfeited after and only after expiration', async () => {
        let name = "test";
        let price = name.length * pricePerByte;
        let salt = 5;
        let zeroAddress = "0x0000000000000000000000000000000000000000";

        let abiCoder = utils.defaultAbiCoder;
        let secret = utils.keccak256(abiCoder.encode([ "uint", "string" ], [ salt, name ]));

        await NameSystem.connect(user1).commit(secret);
        
        let provider = hre.ethers.provider;
        let currentBlock = await getCurrentBlock(provider);
        let nextBlockTimestamp = currentBlock.timestamp + 100;
        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp])

        await NameSystem.connect(user1).registerName(name, salt, {value: price});

        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp + validityPeriod - 10]);

        await expect(NameSystem.connect(user2).forfeitName(name))
            .to.be.revertedWith("NameSystem: the name hasn't expired yet");
        
        await provider.send("evm_setNextBlockTimestamp", [nextBlockTimestamp + validityPeriod + 10]);

        await expect(NameSystem.connect(user1).forfeitName(name))
                .to.emit(NameSystem, "Forfeiture").withArgs(user1.address, name);

        // check that the nameinfo is updated accordingly
        let nameHash = utils.keccak256(utils.toUtf8Bytes(name));
        let nameInfo = await NameSystem.names(nameHash);

        expect(nameInfo.owner).to.be.equal(zeroAddress);
        expect(nameInfo.validUntil).to.be.equal(0);

        // here we check the event of the refund function
        await expect(NameSystem.connect(user1).refund())
                .to.emit(NameSystem, "Refund").withArgs(user1.address, price);
    });
});