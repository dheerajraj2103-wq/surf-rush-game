// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SurfRushRewards
/// @notice Stores player high scores and allows daily reward claims for Surf Rush.
contract SurfRushRewards {
    address public owner;

    /// @notice Reward (in wei) granted per successful claim.
    uint256 public rewardAmount;

    /// @notice Minimum time, in seconds, that must pass between claims for a player.
    uint256 public claimCooldown;

    /// @notice Best score ever submitted by a player.
    mapping(address => uint256) public playerScores;

    /// @notice Timestamp of the last successful claim for a player.
    mapping(address => uint256) public lastClaimTime;

    event ScoreSaved(address indexed player, uint256 score);
    event RewardClaimed(address indexed player, uint256 amount);
    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event RewardAmountUpdated(uint256 newAmount);
    event ClaimCooldownUpdated(uint256 newCooldown);

    modifier onlyOwner() {
        require(msg.sender == owner, "SurfRushRewards: caller is not the owner");
        _;
    }

    /// @param _rewardAmount Initial reward amount per claim, in wei.
    /// @param _claimCooldown Initial cooldown between claims, in seconds.
    constructor(uint256 _rewardAmount, uint256 _claimCooldown) {
        owner = msg.sender;
        rewardAmount = _rewardAmount;
        claimCooldown = _claimCooldown;
    }

    /// @notice Save (or update) the caller's high score.
    /// @dev Only updates storage if the new score is higher than the stored one.
    /// @param score The score achieved by the player.
    function saveScore(uint256 score) external {
        if (score > playerScores[msg.sender]) {
            playerScores[msg.sender] = score;
        }
        emit ScoreSaved(msg.sender, score);
    }

    /// @notice Returns the best score recorded for a player.
    /// @param player Address of the player.
    function getPlayerScore(address player) external view returns (uint256) {
        return playerScores[player];
    }

    /// @notice Checks whether a player is currently eligible to claim a reward.
    /// @param player Address of the player.
    /// @return True if the cooldown has elapsed (or the player has never claimed).
    function canClaim(address player) public view returns (bool) {
        if (lastClaimTime[player] == 0) {
            return true;
        }
        return block.timestamp >= lastClaimTime[player] + claimCooldown;
    }

    /// @notice Checks whether a player has already claimed within the current cooldown window.
    /// @param player Address of the player.
    /// @return True if the player must still wait before claiming again.
    function hasClaimedToday(address player) external view returns (bool) {
        return !canClaim(player);
    }

    /// @notice Claim the configured reward, subject to cooldown and contract balance.
    function claimReward() external {
        require(canClaim(msg.sender), "SurfRushRewards: claim cooldown not elapsed");
        require(playerScores[msg.sender] > 0, "SurfRushRewards: no score recorded");
        require(address(this).balance >= rewardAmount, "SurfRushRewards: insufficient contract balance");

        lastClaimTime[msg.sender] = block.timestamp;

        (bool success, ) = payable(msg.sender).call{value: rewardAmount}("");
        require(success, "SurfRushRewards: reward transfer failed");

        emit RewardClaimed(msg.sender, rewardAmount);
    }

    /// @notice Deposit native currency into the contract to fund rewards.
    function deposit() external payable {
        require(msg.value > 0, "SurfRushRewards: deposit must be greater than zero");
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Allows the contract to receive native currency directly.
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw a specific amount of native currency to the owner.
    /// @param amount Amount in wei to withdraw.
    function withdraw(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "SurfRushRewards: insufficient balance");

        (bool success, ) = payable(owner).call{value: amount}("");
        require(success, "SurfRushRewards: withdrawal failed");

        emit Withdrawn(owner, amount);
    }

    /// @notice Update the reward amount granted per claim.
    /// @param newAmount New reward amount, in wei.
    function setRewardAmount(uint256 newAmount) external onlyOwner {
        rewardAmount = newAmount;
        emit RewardAmountUpdated(newAmount);
    }

    /// @notice Update the cooldown duration between claims.
    /// @param newCooldown New cooldown, in seconds.
    function setClaimCooldown(uint256 newCooldown) external onlyOwner {
        claimCooldown = newCooldown;
        emit ClaimCooldownUpdated(newCooldown);
    }

    /// @notice Transfer ownership of the contract to a new address.
    /// @param newOwner Address of the new owner.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SurfRushRewards: new owner is the zero address");
        owner = newOwner;
    }

    /// @notice Returns the current contract balance.
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
