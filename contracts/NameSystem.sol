pragma solidity >=0.8.0;

contract NameSystem {
    struct NameInfo {
        address owner;
        uint256 validUntil;
    }

    event Registration(
        address indexed newOwner,
        address indexed previousOwner,
        string indexed name,
        uint256 validUntil
    );

    event Extension(
        address indexed owner,
        string indexed name,
        uint256 validUntil
    );

    event Refund(
        address indexed user,
        uint256 amount
    );

    event Forfeiture(
        address indexed owner,
        string indexed name
    );

    uint256 constant public pricePerByte = 100; // price per byte in wei
    uint256 constant public validityPeriod = 604800; // 1 week

    mapping(bytes32 => NameInfo) public names;
    mapping(address => mapping(bytes32 => bool)) public commitments;
    mapping(address => uint256) public refunds;

    /// @param name name we want to calculate the price for
    /// @return the price of the name
    function namePrice(string memory name) public view returns (uint256) {
        return bytes(name).length * pricePerByte;
    }
    /// We use the commit-reveal scheme to prevent front-running
    /// @param secret which is hash of (salt, name), the salt is here to make the commit-reveal scheme more robust
    function commit(bytes32 secret) public {
        commitments[msg.sender][secret] = true;
    }

    /// @param name the name msg.sender wants to register
    /// @param salt the salt used in the committed secret
    function registerName(string memory name, uint256 salt) public payable {
        // Another option is to save price in a storage variable so we don't have to calculate it everytime the name is registered
        uint256 price = namePrice(name);
        require(msg.value >= price, "NameSystem: not enough balance to reserve name.");
        bytes32 secret = keccak256(abi.encode(salt, name));
        require(commitments[msg.sender][secret], "NameSystem: user hasn't commited to this name yet.");
        NameInfo storage nameInfo = names[keccak256(bytes(name))];
        // we save the current owner in a memory variable to save gas because we will use it more than once
        address currentOwner = nameInfo.owner;

        // if the name belonged to someone but the registration expired, we record it to refund so the current owner can withdraw later, we use the push and pull mechanics because if we transfer the eth directly here to current owner it can be reverted in case current owner is a smart contract containing a malicious fallback function
        if (currentOwner != address(0)) {
            require(nameInfo.validUntil < block.timestamp, "NameSystem: name still belongs to someone.");
            refunds[currentOwner] = refunds[currentOwner] + price;
        }
        // register the name to the new owner and update the validity period
        nameInfo.owner = msg.sender;
        nameInfo.validUntil = block.timestamp + validityPeriod;
        // send back the change
        if (msg.value - price != 0) {payable(msg.sender).transfer(msg.value - price);}
        emit Registration(msg.sender, currentOwner, name, block.timestamp + validityPeriod);
    }

    function refund() public {
        uint256 refundAmount = refunds[msg.sender];
        payable(msg.sender).transfer(refundAmount);
        refunds[msg.sender] = 0;
        emit Refund(msg.sender, refundAmount);
    }

    /// @param name name user wants to prolong registration for
    /// User can prolong user if the corresponding NameInfo struct still records his name, which means even in the case validity period has expired but nobody claimed the name yet
    function extendRegistration(string memory name) public {
        NameInfo storage nameInfo = names[keccak256(bytes(name))];
        require(nameInfo.owner == msg.sender, "NameSystem: the name currently doesn't belong to user.");
        nameInfo.validUntil = block.timestamp + validityPeriod;
        emit Extension(msg.sender, name, block.timestamp + validityPeriod);
    }

    /// @param name name user wants to forfeit
    /// can only be called when the registration period has ended and by anyone to free up the name, but the unlocked balance will be returned to current owner
    function forfeitName(string memory name) public {
        NameInfo storage nameInfo = names[keccak256(bytes(name))];
        require(nameInfo.validUntil < block.timestamp, "NameSystem: the name hasn't expired yet");
        // again we use push and pull mechanics to prevent griefing
        address currentOwner = nameInfo.owner;
        refunds[currentOwner] = refunds[currentOwner] + namePrice(name);
        nameInfo.owner = address(0);
        nameInfo.validUntil = 0;
        emit Forfeiture(currentOwner, name);
    }

}