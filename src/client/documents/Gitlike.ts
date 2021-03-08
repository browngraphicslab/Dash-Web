import { Doc, DocListCast, DocListCastAsync } from "../../fields/Doc";
import { List } from "../../fields/List";
import { ObjectField } from "../../fields/ObjectField";
import { Cast, DateCast } from "../../fields/Types";

// synchs matching documents on the two branches that are being merged/pulled
// currently this just synchs the main 'fieldKey' component of the data since 
// we don't have individual timestamps for all fields -- this is a problematic design issue.
function GitlikeSynchDocs(bd: Doc, md: Doc) {
    const fieldKey = Doc.LayoutFieldKey(md);
    let bdate = DateCast(bd[`${fieldKey}-lastModified`])?.date;
    let mdate = DateCast(md[`${fieldKey}-lastModified`])?.date;
    if (bdate === mdate || bdate > mdate) return;
    const bdproto = bd && Doc.GetProto(bd);
    if (bdproto && md) {
        bdproto[fieldKey] = ObjectField.MakeCopy(md[fieldKey] as ObjectField);
        bdproto[`${fieldKey}-lastModified`] = ObjectField.MakeCopy(md[`${fieldKey}-lastModified`] as ObjectField);
    }
}

// pulls documents onto a branch from the branch's master
// if a document exists on master but not on the branch, it is branched and added
// NOTE: need to set a timestamp on the branch that is equal to the master's last merge timestamp.
async function GitlikePullFromMaster(branch: Doc, suffix = "") {
    const masterMain = Cast(branch.branchOf, Doc, null);
    // get the set of documents on both the branch and master
    const masterMainDocs = masterMain && await DocListCastAsync(masterMain[Doc.LayoutFieldKey(masterMain) + suffix]);
    const branchMainDocs = await DocListCastAsync(branch[Doc.LayoutFieldKey(branch) + suffix]);
    // get the master documents that correspond to the branch documents
    const branchMasterMainDocs = branchMainDocs?.map(bd => Cast(bd.branchOf, Doc, null) || bd);
    const branchMasterMainDocProtos = branchMasterMainDocs?.map(doc => Doc.GetProto(doc));
    // get documents on master that don't have a corresponding master doc (form a branch doc), and ...
    const newDocsFromMaster = masterMainDocs?.filter(md => !branchMasterMainDocProtos?.includes(Doc.GetProto(md)));
    const oldDocsFromMaster = masterMainDocs?.filter(md => branchMasterMainDocProtos?.includes(Doc.GetProto(md)));
    oldDocsFromMaster?.forEach(md => {
        const bd = branchMainDocs?.find(bd => (Cast(bd.branchOf, Doc, null) || bd) === md);
        bd && GitlikeSynchDocs(bd, md);
    })
    // make branch clones of them, then add them to the branch
    const newlyBranchedDocs = await Promise.all(newDocsFromMaster?.map(async md => (await Doc.MakeClone(md, false, true)).clone) || []);
    newlyBranchedDocs.forEach(nd => {
        Doc.AddDocToList(branch, Doc.LayoutFieldKey(branch) + suffix, nd);
        nd.context = branch;
    });
    // if a branch doc's corresponding main branch doc doesn't have a context, then it was deleted.  
    const remDocsFromMaster = branchMainDocs?.filter(bd => Cast(bd.branchOf, Doc, null) && !Cast(bd.branchOf, Doc, null)?.context);
    // so then remove all the deleted main docs from this branch.
    remDocsFromMaster?.forEach(rd => Doc.RemoveDocFromList(branch, Doc.LayoutFieldKey(branch) + suffix, rd));
}

// merges all branches from the master branch by first merging the top-level collection of documents, 
// and then merging all the annotations on those documents.
// TODO: need to add an incrementing timestamp whenever anything merges.  don't allow a branch to merge if it's last pull timestamp isn't equal to the last merge timestamp.
async function GitlikeMergeWithMaster(master: Doc, suffix = "") {
    const branches = await DocListCastAsync(master.branches);
    branches?.map(async branch => {
        const branchChildren = await DocListCastAsync(branch[Doc.LayoutFieldKey(branch) + suffix]);
        branchChildren?.forEach(async bd => {
            // see if the branch's child exists on master.  
            const masterChild = Cast(bd.branchOf, Doc, null) || (await Doc.MakeClone(bd, false, true)).clone;
            // if the branch's child didn't exist on master, we make a branch clone of the child to add to master.  
            // however, since master is supposed to have the "main" clone, and branches, the "branch" clones, we have to reverse the fields
            // on the branch child and master clone.
            if (masterChild.branchOf) {
                const branchDocProto = Doc.GetProto(bd);
                const masterChildProto = Doc.GetProto(masterChild);
                masterChildProto.branchOf = undefined; // the master child should not be a branch of the branch child, so unset 'branchOf'
                masterChildProto.branches = new List<Doc>([bd]); // the master child's branches needs to include the branch child
                Doc.RemoveDocFromList(branchDocProto, "branches", masterChildProto);   // the branch child should not have the master child in its branch list.
                branchDocProto.branchOf = masterChild;                                 // the branch child is now a branch of the master child
            }
            Doc.AddDocToList(master, Doc.LayoutFieldKey(master) + suffix, masterChild); // add the masterChild to master (if it's already there, this is a no-op)
            masterChild.context = master;
            GitlikeSynchDocs(Doc.GetProto(masterChild), bd);
        });
        const masterChildren = await DocListCastAsync(master[Doc.LayoutFieldKey(master) + suffix]);
        masterChildren?.forEach(async mc => {                      // see if any master children
            if (!branchChildren?.find(bc => bc.branchOf === mc)) { //    are not in the list of children for this branch. 
                Doc.RemoveDocFromList(master, Doc.LayoutFieldKey(master) + suffix, mc); // if so, delete the master child since the branch has deleted it.
                mc.context = undefined;      // NOTE if we merge a branch that didn't do a pull, it will look like the branch deleted documents -- need edit timestamps that prevent merging if branch isn't up-to-date with last edit timestamp
            }
        });
    });
}

// performs a "git"-like task: pull or merge
//    if pull, then target is a specific branch document that will be updated from its associated master
//    if merge, then target is the master doc that will merge in all branches associated with it.
// TODO: parameterize 'merge' to specify which branch(es) should be merged.   
//       extend 'merge' to allow a specific branch to be merge target (not just master);
//       make pull/merge be recursive (ie, this func currently just operates on the main doc and its children)
export async function BranchTask(target: Doc, action: "pull" | "merge") {
    const func = action === "pull" ? GitlikePullFromMaster : GitlikeMergeWithMaster;
    await func(target, "");
    const targetChildren = await DocListCast(target[Doc.LayoutFieldKey(target)]);
    targetChildren.forEach(async targetChild => await func(targetChild, "-annotations"));
}

export async function BranchCreate(target: Doc) {
    return (await Doc.MakeClone(target, false, true)).clone;
}