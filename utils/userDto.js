function userDto(user) {
  return { _id: user._id, username: user.username, role: user.role };
}

module.exports = userDto;
