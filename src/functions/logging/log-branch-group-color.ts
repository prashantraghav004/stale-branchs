import styles from 'ansi-styles'

export function logBranchGroupColor(branchName, commitAge, daysBeforeStale, daysBeforeDelete): string {
  let groupColor = `[${styles.greenBright.open}${branchName}${styles.greenBright.close}]`

  //color group based on age of branch
  if (commitAge > daysBeforeDelete) {
    groupColor = `[${styles.redBright.open}${branchName}${styles.redBright.close}]`
  } else if (commitAge > daysBeforeStale) {
    groupColor = `[${styles.yellowBright.open}${branchName}${styles.yellowBright.close}]`
  } else if (commitAge < daysBeforeStale) {
    groupColor = `[${styles.greenBright.open}${branchName}${styles.greenBright.close}]`
  }

  return groupColor
}
