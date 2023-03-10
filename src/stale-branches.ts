import * as core from '@actions/core'
import {closeIssue} from './functions/close-issue'
import {compareBranches} from './functions/compare-branches'
import {createIssue} from './functions/create-issue'
import {createIssueComment} from './functions/create-issue-comment'
import {createIssueTitleString} from './functions/utils/create-issues-title-string'
import {deleteBranch} from './functions/delete-branch'
import {getBranches} from './functions/get-branches'
import {getIssueBudget} from './functions/get-stale-issue-budget'
import {getIssues} from './functions/get-issues'
import {getRateLimit} from './functions/get-rate-limit'
import {getRecentCommitAge} from './functions/get-commit-age'
import {getRecentCommitLogin} from './functions/get-committer-login'
import {logActiveBranch} from './functions/logging/log-active-branch'
import {logBranchGroupColor} from './functions/logging/log-branch-group-color'
import {logLastCommitColor} from './functions/logging/log-last-commit-color'
import {logMaxIssues} from './functions/logging/log-max-issues'
import {logOrphanedIssues} from './functions/logging/log-orphaned-issues'
import {logRateLimitBreak} from './functions/logging/log-rate-limit-break'
import {logTotalAssessed} from './functions/logging/log-total-assessed'
import {logTotalDeleted} from './functions/logging/log-total-deleted'
import {validateInputs} from './functions/get-context'

export async function run(): Promise<void> {
  //Declare output arrays
  const outputDeletes: string[] = []
  const outputStales: string[] = []

  try {
    //Validate & Return input values
    const validInputs = await validateInputs()
    if (validInputs.daysBeforeStale == null) {
      throw new Error('Invalid inputs')
    }
    //Collect Branches, Issue Budget, Existing Issues, & initialize lastCommitLogin
    const branches = await getBranches()
    const outputTotal = branches.length
    let existingIssue = await getIssues(validInputs.staleBranchLabel)
    let issueBudgetRemaining = await getIssueBudget(validInputs.maxIssues, validInputs.staleBranchLabel)
    let lastCommitLogin = 'Unknown'

    // Assess Branches
    for (const branchToCheck of branches) {
      // Break if Rate Limit usage exceeds 95%
      const rateLimit = await getRateLimit()
      if (rateLimit.used > 95) {
        core.info(logRateLimitBreak(rateLimit))
        core.setFailed('Exiting to avoid rate limit violation.')
        break
      }

      //Get age of last commit, generate issue title, and filter existing issues to current branch
      const commitAge = await getRecentCommitAge(branchToCheck.commmitSha)
      const issueTitleString = createIssueTitleString(branchToCheck.branchName)
      const filteredIssue = existingIssue.filter(branchIssue => branchIssue.issueTitle === issueTitleString)

      // Skip looking for last commit's login if input is set to false
      if (validInputs.tagLastCommitter === true) {
        lastCommitLogin = await getRecentCommitLogin(branchToCheck.commmitSha)
      }

      // Start output group for current branch assessment
      core.startGroup(logBranchGroupColor(branchToCheck.branchName, commitAge, validInputs.daysBeforeStale, validInputs.daysBeforeDelete))

      //Compare current branch to default branch
      const branchComparison = await compareBranches(branchToCheck.branchName, validInputs.compareBranches)

      //Log last commit age
      core.info(logLastCommitColor(commitAge, validInputs.daysBeforeStale, validInputs.daysBeforeDelete))

      //Create new issue if branch is stale & existing issue is not found & issue budget is >0
      if (commitAge > validInputs.daysBeforeStale) {
        if (!filteredIssue.find(findIssue => findIssue.issueTitle === issueTitleString) && issueBudgetRemaining > 0) {
          await createIssue(branchToCheck.branchName, commitAge, lastCommitLogin, validInputs.daysBeforeDelete, validInputs.staleBranchLabel, validInputs.tagLastCommitter)
          issueBudgetRemaining--
          core.info(logMaxIssues(issueBudgetRemaining))
          if (!outputStales.includes(branchToCheck.branchName)) {

           
            outputStales.push({
                'stale-branches' : branchToCheck.branchName
                'deleted-branches' : null
            })
          }
        }
      }

      //Close issues if a branch becomes active again
      if (commitAge < validInputs.daysBeforeStale) {
        for (const issueToClose of filteredIssue) {
          if (issueToClose.issueTitle === issueTitleString) {
            core.info(logActiveBranch(branchToCheck.branchName))
            await closeIssue(issueToClose.issueNumber)
          }
        }
      }

      //Update existing issues
      if (commitAge > validInputs.daysBeforeStale) {
        for (const issueToUpdate of filteredIssue) {
          if (issueToUpdate.issueTitle === issueTitleString) {
            await createIssueComment(
              issueToUpdate.issueNumber,
              branchToCheck.branchName,
              commitAge,
              lastCommitLogin,
              validInputs.commentUpdates,
              validInputs.daysBeforeDelete,
              validInputs.staleBranchLabel,
              validInputs.tagLastCommitter
            )
            if (!outputStales.includes(branchToCheck.branchName)) {
              outputStales.push({
                "stale-branches": branchToCheck.branchName,
                'deleted-branches': null
            })
            }
          }
        }
      }

      //Delete expired branches
      if (commitAge > validInputs.daysBeforeDelete && branchComparison.save === false) {
        for (const issueToDelete of filteredIssue) {
          if (issueToDelete.issueTitle === issueTitleString) {
            await deleteBranch(branchToCheck.branchName)
            await closeIssue(issueToDelete.issueNumber)
           
            outputStales.push({
                "stale-branches": null,
                'deleted-branches': branchToCheck.branchName
            })
          }
        }
      }

      // Remove filteredIssue from existingIssue
      existingIssue = existingIssue.filter(branchIssue => branchIssue.issueTitle !== issueTitleString)

      // Close output group for current branch assessment
      core.endGroup()
    }
    // Close orphaned Issues
    if (existingIssue.length > 0) {
      core.startGroup(logOrphanedIssues(existingIssue.length))
      for (const issueToDelete of existingIssue) {
        // Break if Rate Limit usage exceeds 95%
        const rateLimit = await getRateLimit()
        if (rateLimit.used > 95) {
          core.info(logRateLimitBreak(rateLimit))
          core.setFailed('Exiting to avoid rate limit violation.')
          break
        } else {
          await closeIssue(issueToDelete.issueNumber)
        }
      }
      core.endGroup()
    }
    downloadFile(outputStales, 'data');
    core.setOutput('stale-branches', downloadFile(outputStales, 'data'))
    core.setOutput('deleted-branches', JSON.stringify(outputDeletes))
    core.info(logTotalAssessed(outputStales.length, outputTotal))
    core.info(logTotalDeleted(outputDeletes.length, outputStales.length))
  } catch (error) {
    if (error instanceof Error) core.setFailed(`Action failed. Error: ${error.message}`)
  }

  downloadFile(outputStales, 'data');

  function downloadFile(data, filename = 'data') {
    console.log("++++++++++++++++CCCCCCCCOOOOOOOO")
    let csvData = ConvertToCSV(data, [
      'stale-branches',
      'deleted-branches'
    ]);
    console.log(csvData);
    let blob = new Blob(['\ufeff' + csvData], {
      type: 'text/csv;charset=utf-8;',
    });
    let dwldLink = document.createElement('a');
    let url = URL.createObjectURL(blob);
    let isSafariBrowser =
      navigator.userAgent.indexOf('Safari') != -1 &&
      navigator.userAgent.indexOf('Chrome') == -1;
    if (isSafariBrowser) {
      //if Safari open in new window to save file with random filename.
      dwldLink.setAttribute('target', '_blank');
    }
    dwldLink.setAttribute('href', url);
    dwldLink.setAttribute('download', filename + '.csv');
    dwldLink.style.visibility = 'hidden';
    document.body.appendChild(dwldLink);
    dwldLink.click();
    document.body.removeChild(dwldLink);
  }
  
  function ConvertToCSV(objArray, headerList) {
    let array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    let row = 'S.No,';
  
    for (let index in headerList) {
      row += headerList[index] + ',';
    }
    row = row.slice(0, -1);
    str += row + '\r\n';
    for (let i = 0; i < array.length; i++) {
      let line = i + 1 + '';
      for (let index in headerList) {
        let head = headerList[index];
  
        line += ',' + array[i][head];
      }
      str += line + '\r\n';
    }
    return str;
  }




  //
}