export const getScoreColorText = (score: number) => {
  switch (score) {
    case 5:
      return "text-indigo-600"
    case 4:
      return "text-teal-600"
    case 3:
      return "text-green-600"
    case 2:
      return "text-lime-600"
    case 1:
      return "text-yellow-600"
    default:
      return "text-gray-600"
  }
}

