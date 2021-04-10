import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { intersection } from "lodash";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import Select from "react-select";
import * as RequestPromise from "request-promise";
import { AclAddonly, AclAdmin, AclEdit, AclPrivate, AclReadonly, AclSym, AclUnset, DataSym, Doc, DocListCast, DocListCastAsync, Opt } from "../../fields/Doc";
import { List } from "../../fields/List";
import { Cast, NumCast, StrCast } from "../../fields/Types";
import { distributeAcls, GetEffectiveAcl, normalizeEmail, SharingPermissions, TraceMobx } from "../../fields/util";
import { Utils } from "../../Utils";
import { DocServer } from "../DocServer";
import { CollectionView } from "../views/collections/CollectionView";
import { DictationOverlay } from "../views/DictationOverlay";
import { MainViewModal } from "../views/MainViewModal";
import { DocumentView } from "../views/nodes/DocumentView";
import { TaskCompletionBox } from "../views/nodes/TaskCompletedBox";
import { SearchBox } from "../views/search/SearchBox";
import { CurrentUserUtils } from "./CurrentUserUtils";
import { DocumentManager } from "./DocumentManager";
import { GroupManager, UserOptions } from "./GroupManager";
import { GroupMemberView } from "./GroupMemberView";
import { SelectionManager } from "./SelectionManager";
import "./SharingManager.scss";

export interface User {
    email: string;
    sharingDocumentId: string;
    linkDatabaseId: string;
}

/**
 * Interface for grouped options for the react-select component.
 */
interface GroupedOptions {
    label: string;
    options: UserOptions[];
}

// const SharingKey = "sharingPermissions";
// const PublicKey = "publicLinkPermissions";
// const DefaultColor = "black";

// used to differentiate between individuals and groups when sharing
const indType = "!indType/";
const groupType = "!groupType/";

const storage = "data";

/**
 * A user who also has a sharing doc.
 */
interface ValidatedUser {
    user: User;         // database minimal info to identify / communicate with a user (email, sharing doc id)
    sharingDoc: Doc;    // document to share/message another user
    linkDatabase: Doc;
    userColor: string;  // stored on the sharinDoc, extracted for convenience?
}

@observer
export class SharingManager extends React.Component<{}> {
    public static Instance: SharingManager;
    @observable private isOpen = false; // whether the SharingManager modal is open or not
    @observable public users: ValidatedUser[] = []; // the list of users with sharing docs
    @observable private targetDoc: Doc | undefined; // the document being shared
    @observable private targetDocView: DocumentView | undefined; // the DocumentView of the document being shared
    // @observable private copied = false;
    @observable private dialogueBoxOpacity = 1; // for the modal
    @observable private overlayOpacity = 0.4; // for the modal
    @observable private selectedUsers: UserOptions[] | null = null; // users (individuals/groups) selected to share with
    @observable private permissions: SharingPermissions = SharingPermissions.Edit; // the permission with which to share with other users
    @observable private individualSort: "ascending" | "descending" | "none" = "none"; // sorting options for the list of individuals
    @observable private groupSort: "ascending" | "descending" | "none" = "none"; // sorting options for the list of groups
    private shareDocumentButtonRef: React.RefObject<HTMLButtonElement> = React.createRef(); // ref for the share button, used for the position of the popup
    private distributeAclsButtonRef: React.RefObject<HTMLButtonElement> = React.createRef(); // ref for the distribute button, used for the position of the popup
    // if both showUserOptions and showGroupOptions are false then both are displayed
    @observable private showUserOptions: boolean = false; // whether to show individuals as options when sharing (in the react-select component)
    @observable private showGroupOptions: boolean = false; // // whether to show groups as options when sharing (in the react-select component)
    private populating: boolean = false; // whether the list of users is populating or not
    @observable private layoutDocAcls: boolean = false; // whether the layout doc or data doc's acls are to be used
    @observable private myDocAcls: boolean = false; // whether the My Docs checkbox is selected or not

    // maps acl symbols to SharingPermissions
    private AclMap = new Map<symbol, string>([
        [AclPrivate, SharingPermissions.None],
        [AclReadonly, SharingPermissions.View],
        [AclAddonly, SharingPermissions.Add],
        [AclEdit, SharingPermissions.Edit],
        [AclAdmin, SharingPermissions.Admin]
    ]);

    // private get linkVisible() {
    //     return this.sharingDoc ? this.sharingDoc[PublicKey] !== SharingPermissions.None : false;
    // }

    public open = (target?: DocumentView, target_doc?: Doc) => {
        this.populateUsers();
        runInAction(() => {
            this.targetDocView = target;
            this.targetDoc = target_doc || target?.props.Document;
            DictationOverlay.Instance.hasActiveModal = true;
            this.isOpen = this.targetDoc !== undefined;
            this.permissions = SharingPermissions.Add;
        });
    }

    public close = action(() => {
        this.isOpen = false;
        this.selectedUsers = null; // resets the list of users and selected users (in the react-select component)
        TaskCompletionBox.taskCompleted = false;
        setTimeout(action(() => {
            // this.copied = false;
            DictationOverlay.Instance.hasActiveModal = false;
            this.targetDoc = undefined;
        }), 500);
    });

    constructor(props: {}) {
        super(props);
        SharingManager.Instance = this;
    }

    /**
     * Populates the list of users.
     */
    componentDidMount() {
        this.populateUsers();
    }

    /**
     * Populates the list of validated users (this.users) by adding registered users which have a sharingDocument.
     */
    populateUsers = async () => {
        if (!this.populating) {
            this.populating = true;
            const userList = await RequestPromise.get(Utils.prepend("/getUsers"));
            const raw = JSON.parse(userList) as User[];
            const sharingDocs: ValidatedUser[] = [];
            const evaluating = raw.map(async user => {
                const isCandidate = user.email !== Doc.CurrentUserEmail;
                if (isCandidate) {
                    const sharingDoc = await DocServer.GetRefField(user.sharingDocumentId);
                    const linkDatabase = await DocServer.GetRefField(user.linkDatabaseId);
                    if (sharingDoc instanceof Doc && linkDatabase instanceof Doc) {
                        await DocListCastAsync(linkDatabase.data);
                        (await DocListCastAsync(Cast(linkDatabase, Doc, null).data))?.forEach(async link => { // makes sure link anchors are loaded to avoid incremental updates to computedFns in LinkManager
                            const a1 = await Cast(link?.anchor1, Doc, null);
                            const a2 = await Cast(link?.anchor2, Doc, null);
                        });
                        sharingDocs.push({ user, sharingDoc, linkDatabase, userColor: StrCast(sharingDoc.color) });
                    }
                }
            });
            return Promise.all(evaluating).then(() => {
                runInAction(() => {
                    for (const sharer of sharingDocs) {
                        if (!this.users.find(user => user.user.email === sharer.user.email)) {
                            this.users.push(sharer);
                        }
                    }
                });
                this.populating = false;
            });
        }
    }

    /**
     * Shares the document with a user.
     */
    setInternalSharing = (recipient: ValidatedUser, permission: string, targetDoc?: Doc) => {
        const { user, sharingDoc } = recipient;
        const target = targetDoc || this.targetDoc!;
        const acl = `acl-${normalizeEmail(user.email)}`;
        const myAcl = `acl-${Doc.CurrentUserEmailNormalized}`;

        const docs = SelectionManager.Views().length < 2 ? [target] : SelectionManager.Views().map(docView => docView.props.Document);
        return !docs.map(doc => {
            doc.author === Doc.CurrentUserEmail && !doc[myAcl] && distributeAcls(myAcl, SharingPermissions.Admin, doc);

            if (permission === SharingPermissions.None) {
                if (doc[acl] && doc[acl] !== SharingPermissions.None) doc.numUsersShared = NumCast(doc.numUsersShared, 1) - 1;
            }
            else {
                if (!doc[acl] || doc[acl] === SharingPermissions.None) doc.numUsersShared = NumCast(doc.numUsersShared, 0) + 1;
            }

            distributeAcls(acl, permission as SharingPermissions, doc);

            this.setDashboardBackground(doc, permission as SharingPermissions);
            if (permission !== SharingPermissions.None) return Doc.AddDocToList(sharingDoc, storage, doc);
            else return GetEffectiveAcl(doc, user.email) === AclPrivate && Doc.RemoveDocFromList(sharingDoc, storage, (doc.aliasOf as Doc || doc));
        }).some(success => !success);
    }

    /**
     * Sets the permission on the target for the group.
     * @param group 
     * @param permission 
     */
    setInternalGroupSharing = (group: Doc | { title: string }, permission: string, targetDoc?: Doc) => {

        const target = targetDoc || this.targetDoc!;
        const key = normalizeEmail(StrCast(group.title));
        const acl = `acl-${key}`;

        const docs = SelectionManager.Views().length < 2 ? [target] : SelectionManager.Views().map(docView => docView.props.Document);

        // ! ensures it returns true if document has been shared successfully, false otherwise
        return !docs.map(doc => {
            doc.author === Doc.CurrentUserEmail && !doc[`acl-${Doc.CurrentUserEmailNormalized}`] && distributeAcls(`acl-${Doc.CurrentUserEmailNormalized}`, SharingPermissions.Admin, doc);

            if (permission === SharingPermissions.None) {
                if (doc[acl] && doc[acl] !== SharingPermissions.None) doc.numGroupsShared = NumCast(doc.numGroupsShared, 1) - 1;
            }
            else {
                if (!doc[acl] || doc[acl] === SharingPermissions.None) doc.numGroupsShared = NumCast(doc.numGroupsShared, 0) + 1;
            }

            distributeAcls(acl, permission as SharingPermissions, doc);
            this.setDashboardBackground(doc, permission as SharingPermissions);

            if (group instanceof Doc) {
                const members: string[] = JSON.parse(StrCast(group.members));
                const users: ValidatedUser[] = this.users.filter(({ user: { email } }) => members.includes(email));

                // if documents have been shared, add the doc to that list if it doesn't already exist, otherwise create a new list with the doc
                group.docsShared ? Doc.IndexOf(doc, DocListCast(group.docsShared)) === -1 && (group.docsShared as List<Doc>).push(doc) : group.docsShared = new List<Doc>([doc]);

                return users.map(({ user, sharingDoc }) => {
                    if (permission !== SharingPermissions.None) return Doc.AddDocToList(sharingDoc, storage, doc); // add the doc to the sharingDoc if it hasn't already been added
                    else return GetEffectiveAcl(doc, user.email) === AclPrivate && Doc.RemoveDocFromList(sharingDoc, storage, (doc.aliasOf as Doc || doc)); // remove the doc from the list if it already exists
                }).some(success => !success);
            }
        }).some(success => success);
    }

    /**
     * Shares the documents shared with a group with a new user who has been added to that group.
     * @param group 
     * @param emailId 
     */
    shareWithAddedMember = (group: Doc, emailId: string, retry: boolean = true) => {
        const user = this.users.find(({ user: { email } }) => email === emailId)!;
        const self = this;
        if (group.docsShared) {
            if (!user) retry && this.populateUsers().then(() => self.shareWithAddedMember(group, emailId, false));
            else {
                DocListCastAsync(user.sharingDoc[storage]).then(userdocs =>
                    DocListCastAsync(group.docsShared).then(dl => {
                        const filtered = dl?.filter(doc => !userdocs?.includes(doc));
                        filtered && userdocs?.push(...filtered);
                    }));
            }
        }
    }

    /**
     * Called from the properties sidebar to change permissions of a user.
     */
    shareFromPropertiesSidebar = (shareWith: string, permission: SharingPermissions, docs: Doc[]) => {
        if (shareWith !== "Public" && shareWith !== "Override") {
            const user = this.users.find(({ user: { email } }) => email === (shareWith === "Me" ? Doc.CurrentUserEmail : shareWith));
            docs.forEach(doc => {
                if (user) this.setInternalSharing(user, permission, doc);
                else this.setInternalGroupSharing(GroupManager.Instance.getGroup(shareWith)!, permission, doc);
            });
        }
        else {
            docs.forEach(doc => {
                if (GetEffectiveAcl(doc) === AclAdmin) distributeAcls(`acl-${shareWith}`, permission, doc);
            });
        }
    }

    /**
     * Sets the background of the Dashboard if it has been shared as a visual indicator
     */
    setDashboardBackground = async (doc: Doc, permission: SharingPermissions) => {
        if (Doc.IndexOf(doc, DocListCast(CurrentUserUtils.MyDashboards.data)) !== -1) {
            if (permission !== SharingPermissions.None) {
                doc.isShared = true;
                doc.backgroundColor = "green";
            }
            else {
                const acls = doc[DataSym][AclSym];
                if (Object.keys(acls).every(key => key === `acl-${Doc.CurrentUserEmailNormalized}` ? true : [AclUnset, AclPrivate].includes(acls[key]))) {
                    doc.isShared = undefined;
                    doc.backgroundColor = undefined;
                }
            }
        }
    }

    /**
     * Removes the documents shared with a user through a group when the user is removed from the group.
     * @param group 
     * @param emailId 
     */
    removeMember = (group: Doc, emailId: string) => {
        const user: ValidatedUser = this.users.find(({ user: { email } }) => email === emailId)!;

        if (group.docsShared) {
            DocListCastAsync(user.sharingDoc[storage]).then(userdocs =>
                DocListCastAsync(group.docsShared).then(dl => {
                    const remaining = userdocs?.filter(doc => !dl?.includes(doc)) || [];
                    userdocs?.splice(0, userdocs.length, ...remaining);
                })
            );
        }
    }

    /**
     * Removes a group's permissions from documents that have been shared with it.
     * @param group 
     */
    removeGroup = (group: Doc) => {
        if (group.docsShared) {
            DocListCast(group.docsShared).forEach(doc => {
                const acl = `acl-${StrCast(group.title)}`;

                distributeAcls(acl, SharingPermissions.None, doc);

                const members: string[] = JSON.parse(StrCast(group.members));
                const users: ValidatedUser[] = this.users.filter(({ user: { email } }) => members.includes(email));

                users.forEach(({ sharingDoc }) => Doc.RemoveDocFromList(sharingDoc, storage, doc));
            });
        }
    }



    // private setExternalSharing = (permission: string) => {
    //     const sharingDoc = this.sharingDoc;
    //     if (!sharingDoc) {
    //         return;
    //     }
    //     sharingDoc[PublicKey] = permission;
    // }

    // private get sharingUrl() {
    //     if (!this.targetDoc) {
    //         return undefined;
    //     }
    //     const baseUrl = Utils.prepend("/doc/" + this.targetDoc[Id]);
    //     return `${baseUrl}?sharing=true`;
    // }

    // copy = action(() => {
    //     if (this.sharingUrl) {
    //         Utils.CopyText(this.sharingUrl);
    //         this.copied = true;
    //     }
    // });

    /**
     * Returns the SharingPermissions (Admin, Can Edit etc) access that's used to share
     */
    private sharingOptions(uniform: boolean, override?: boolean) {
        const dropdownValues: string[] = Object.values(SharingPermissions);
        if (!uniform) dropdownValues.unshift("-multiple-");
        if (override) dropdownValues.unshift("None");
        return dropdownValues.filter(permission => permission !== SharingPermissions.View).map(permission =>
        (
            <option key={permission} value={permission}>
                {permission === SharingPermissions.Add ? "Can Augment" : permission}
            </option>
        )
        );
    }

    private focusOn = (contents: string) => {
        const title = this.targetDoc ? StrCast(this.targetDoc.title) : "";
        const docs = SelectionManager.Views().length > 1 ? SelectionManager.Views().map(docView => docView.props.Document) : [this.targetDoc];
        return (
            <span
                className={"focus-span"}
                title={title}
                onClick={() => {
                    let context: Opt<CollectionView>;
                    if (this.targetDoc && this.targetDocView && docs.length === 1 && (context = this.targetDocView.props.ContainingCollectionView)) {
                        DocumentManager.Instance.jumpToDocument(this.targetDoc, true, undefined, context.props.Document);
                    }
                }}
                onPointerEnter={action(() => {
                    if (docs.length) {
                        docs.forEach(doc => doc && Doc.BrushDoc(doc));
                        this.dialogueBoxOpacity = 0.1;
                        this.overlayOpacity = 0.1;
                    }
                })}
                onPointerLeave={action(() => {
                    if (docs.length) {
                        docs.forEach(doc => doc && Doc.UnBrushDoc(doc));
                        this.dialogueBoxOpacity = 1;
                        this.overlayOpacity = 0.4;
                    }
                })}
            >
                {contents}
            </span>
        );
    }

    /**
     * Handles changes in the users selected in react-select
     */
    @action
    handleUsersChange = (selectedOptions: any) => {
        this.selectedUsers = selectedOptions as UserOptions[];
    }

    /**
     * Handles changes in the permission chosen to share with someone with
     */
    @action
    handlePermissionsChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        this.permissions = event.currentTarget.value as SharingPermissions;
    }

    /**
     * Calls the relevant method for sharing, displays the popup, and resets the relevant variables.
     */
    @action
    share = () => {
        if (this.selectedUsers) {
            this.selectedUsers.forEach(user => {
                if (user.value.includes(indType)) {
                    this.setInternalSharing(this.users.find(u => u.user.email === user.label)!, this.permissions);
                }
                else {
                    this.setInternalGroupSharing(GroupManager.Instance.getGroup(user.label)!, this.permissions);
                }
            });

            const { left, width, top, height } = this.shareDocumentButtonRef.current!.getBoundingClientRect();
            TaskCompletionBox.popupX = left - 1.5 * width;
            TaskCompletionBox.popupY = top - 1.5 * height;
            TaskCompletionBox.textDisplayed = "Document shared!";
            TaskCompletionBox.taskCompleted = true;
            setTimeout(action(() => TaskCompletionBox.taskCompleted = false), 2000);

            this.selectedUsers = null;
        }
    }

    distributeOverCollection = (targetDoc?: Doc) => {
        const target = targetDoc || this.targetDoc!;

        const docs = SelectionManager.Views().length < 2 ? [target] : SelectionManager.Views().map(docView => docView.props.Document);
        docs.forEach(doc => {
            for (const [key, value] of Object.entries(doc[AclSym])) {
                distributeAcls(key, this.AclMap.get(value)! as SharingPermissions, target);
            }
        });
    }

    /**
     * Sorting algorithm to sort users.
     */
    sortUsers = (u1: ValidatedUser, u2: ValidatedUser) => {
        const { email: e1 } = u1.user;
        const { email: e2 } = u2.user;
        return e1 < e2 ? -1 : e1 === e2 ? 0 : 1;
    }

    /**
     * Sorting algorithm to sort groups.
     */
    sortGroups = (group1: Doc, group2: Doc) => {
        const g1 = StrCast(group1.title);
        const g2 = StrCast(group2.title);
        return g1 < g2 ? -1 : g1 === g2 ? 0 : 1;
    }

    /**
     * @returns the main interface of the SharingManager.
     */
    @computed get sharingInterface() {
        TraceMobx();
        const groupList = GroupManager.Instance?.allGroups || [];
        const sortedUsers = this.users.slice().sort(this.sortUsers).map(({ user: { email } }) => ({ label: email, value: indType + email }));
        const sortedGroups = groupList.slice().sort(this.sortGroups).map(({ title }) => ({ label: StrCast(title), value: groupType + StrCast(title) }));

        // the next block handles the users shown (individuals/groups/both)
        const options: GroupedOptions[] = [];
        if (GroupManager.Instance) {
            if ((this.showUserOptions && this.showGroupOptions) || (!this.showUserOptions && !this.showGroupOptions)) {
                options.push(
                    { label: 'Individuals', options: sortedUsers },
                    { label: 'Groups', options: sortedGroups });
            }
            else if (this.showUserOptions) options.push({ label: 'Individuals', options: sortedUsers });
            else options.push({ label: 'Groups', options: sortedGroups });
        }

        const users = this.individualSort === "ascending" ? this.users.slice().sort(this.sortUsers) : this.individualSort === "descending" ? this.users.slice().sort(this.sortUsers).reverse() : this.users;
        const groups = this.groupSort === "ascending" ? groupList.slice().sort(this.sortGroups) : this.groupSort === "descending" ? groupList.slice().sort(this.sortGroups).reverse() : groupList;

        // handles the case where multiple documents are selected
        let docs = SelectionManager.Views().length < 2 ?
            [this.layoutDocAcls ? this.targetDoc : this.targetDoc?.[DataSym]]
            : SelectionManager.Views().map(docView => this.layoutDocAcls ? docView.props.Document : docView.props.Document?.[DataSym]);

        if (this.myDocAcls) {
            const newDocs: Doc[] = [];
            SearchBox.foreachRecursiveDoc(docs, doc => newDocs.push(doc));
            docs = newDocs.filter(doc => GetEffectiveAcl(doc) === AclAdmin);
        }

        const targetDoc = docs[0];

        // tslint:disable-next-line: no-unnecessary-callback-wrapper
        const effectiveAcls = docs.map(doc => GetEffectiveAcl(doc));
        const admin = this.myDocAcls ? Boolean(docs.length) : effectiveAcls.every(acl => acl === AclAdmin);

        // users in common between all docs
        const commonKeys = intersection(...docs.map(doc => this.layoutDocAcls ? doc?.[AclSym] && Object.keys(doc[AclSym]) : doc?.[DataSym]?.[AclSym] && Object.keys(doc[DataSym][AclSym])));

        // the list of users shared with
        const userListContents: (JSX.Element | null)[] = users.filter(({ user }) => docs.length > 1 ? commonKeys.includes(`acl-${normalizeEmail(user.email)}`) : docs[0]?.author !== user.email).map(({ user, linkDatabase, sharingDoc, userColor }) => {
            const userKey = `acl-${normalizeEmail(user.email)}`;
            const uniform = docs.every(doc => this.layoutDocAcls ? doc?.[AclSym]?.[userKey] === docs[0]?.[AclSym]?.[userKey] : doc?.[DataSym]?.[AclSym]?.[userKey] === docs[0]?.[DataSym]?.[AclSym]?.[userKey]);
            const permissions = uniform ? StrCast(targetDoc?.[userKey]) : "-multiple-";

            return !permissions ? (null) : (
                <div
                    key={userKey}
                    className={"container"}
                >
                    <span className={"padding"}>{user.email}</span>
                    <div className="edit-actions">
                        {admin || this.myDocAcls ? (
                            <select
                                className={"permissions-dropdown"}
                                value={permissions}
                                onChange={e => this.setInternalSharing({ user, linkDatabase, sharingDoc, userColor }, e.currentTarget.value)}
                            >
                                {this.sharingOptions(uniform)}
                            </select>
                        ) : (
                            <div className={"permissions-dropdown"}>
                                {permissions === SharingPermissions.Add ? "Can Augment" : permissions}
                            </div>
                        )}
                    </div>
                </div>
            );
        });

        // checks if every doc has the same author
        const sameAuthor = docs.every(doc => doc?.author === docs[0]?.author);

        // the owner of the doc and the current user are placed at the top of the user list.
        userListContents.unshift(
            sameAuthor ?
                (
                    <div
                        key={"owner"}
                        className={"container"}
                    >
                        <span className={"padding"}>{targetDoc?.author === Doc.CurrentUserEmail ? "Me" : targetDoc?.author}</span>
                        <div className="edit-actions">
                            <div className={"permissions-dropdown"}>
                                Owner
                        </div>
                        </div>
                    </div>
                ) : null,
            sameAuthor && targetDoc?.author !== Doc.CurrentUserEmail ?
                (
                    <div
                        key={"me"}
                        className={"container"}
                    >
                        <span className={"padding"}>Me</span>
                        <div className="edit-actions">
                            <div className={"permissions-dropdown"}>
                                {effectiveAcls.every(acl => acl === effectiveAcls[0]) ? this.AclMap.get(effectiveAcls[0])! : "-multiple-"}
                            </div>
                        </div>
                    </div>
                ) : null
        );


        // the list of groups shared with
        const groupListMap: (Doc | { title: string })[] = groups.filter(({ title }) => docs.length > 1 ? commonKeys.includes(`acl-${normalizeEmail(StrCast(title))}`) : true);
        groupListMap.unshift({ title: "Public" });//, { title: "Override" });
        const groupListContents = groupListMap.map(group => {
            const groupKey = `acl-${StrCast(group.title)}`;
            const uniform = docs.every(doc => this.layoutDocAcls ? doc?.[AclSym]?.[groupKey] === docs[0]?.[AclSym]?.[groupKey] : doc?.[DataSym]?.[AclSym]?.[groupKey] === docs[0]?.[DataSym]?.[AclSym]?.[groupKey]);
            const permissions = uniform ? StrCast(targetDoc?.[`acl-${StrCast(group.title)}`]) : "-multiple-";

            return !permissions ? (null) : (
                <div
                    key={groupKey}
                    className={"container"}
                >
                    <div className={"padding"}>{group.title}</div>
                    {group instanceof Doc ?
                        (<div className="group-info" onClick={action(() => GroupManager.Instance.currentGroup = group)}>
                            <FontAwesomeIcon icon={"info-circle"} color={"#e8e8e8"} size={"sm"} style={{ backgroundColor: "#1e89d7", borderRadius: "100%", border: "1px solid #1e89d7" }} />
                        </div>)
                        : (null)}
                    <div className="edit-actions">
                        {admin || this.myDocAcls ? (
                            <select
                                className={"permissions-dropdown"}
                                value={permissions}
                                onChange={e => this.setInternalGroupSharing(group, e.currentTarget.value)}
                            >
                                {this.sharingOptions(uniform, group.title === "Override")}
                            </select>
                        ) : (
                            <div className={"permissions-dropdown"}>
                                {permissions}
                            </div>
                        )}
                    </div>
                </div>
            );
        });

        return (
            <div className={"sharing-interface"}>
                {GroupManager.Instance?.currentGroup ?
                    <GroupMemberView
                        group={GroupManager.Instance.currentGroup}
                        onCloseButtonClick={action(() => GroupManager.Instance.currentGroup = undefined)}
                    /> :
                    null}
                <div className="sharing-contents">
                    <p className={"share-title"}><b>Share </b>{this.focusOn(docs.length < 2 ? StrCast(targetDoc?.title, "this document") : "-multiple-")}</p>
                    <div className={"close-button"} onClick={this.close}>
                        <FontAwesomeIcon icon={"times"} color={"black"} size={"lg"} />
                    </div>
                    {<div className="share-container">
                        <div className="share-setup">
                            <Select
                                className="user-search"
                                placeholder="Enter user or group name..."
                                isMulti
                                isSearchable
                                closeMenuOnSelect={false}
                                options={options}
                                onChange={this.handleUsersChange}
                                value={this.selectedUsers}
                                styles={{
                                    indicatorSeparator: () => ({
                                        visibility: "hidden"
                                    })
                                }}
                            />
                            <select className="permissions-select" onChange={this.handlePermissionsChange} value={this.permissions}>
                                {this.sharingOptions(true)}
                            </select>
                            <button ref={this.shareDocumentButtonRef} className="share-button" onClick={this.share}>
                                Share
                            </button>
                        </div>
                        <div className="sort-checkboxes">
                            <input type="checkbox" onChange={action(() => this.showUserOptions = !this.showUserOptions)} /> <label style={{ marginRight: 10 }}>Individuals</label>
                            <input type="checkbox" onChange={action(() => this.showGroupOptions = !this.showGroupOptions)} /> <label>Groups</label>
                        </div>

                        <div className="acl-container">
                            {Doc.UserDoc().noviceMode ? (null) :
                                <div className="layoutDoc-acls">
                                    <input type="checkbox" onChange={action(() => this.layoutDocAcls = !this.layoutDocAcls)} checked={this.layoutDocAcls} /> <label>Layout</label>
                                </div>}
                        </div>
                    </div>
                    }
                    <div className="main-container">
                        <div className={"individual-container"}>
                            <div
                                className="user-sort"
                                onClick={action(() => this.individualSort = this.individualSort === "ascending" ? "descending" : this.individualSort === "descending" ? "none" : "ascending")}>
                                Individuals {this.individualSort === "ascending" ? <FontAwesomeIcon icon={"caret-up"} size={"xs"} />
                                    : this.individualSort === "descending" ? <FontAwesomeIcon icon={"caret-down"} size={"xs"} />
                                        : <FontAwesomeIcon icon={"caret-right"} size={"xs"} />}
                            </div>
                            <div className={"users-list"}>
                                {userListContents}
                            </div>
                        </div>
                        <div className={"group-container"}>
                            <div
                                className="user-sort"
                                onClick={action(() => this.groupSort = this.groupSort === "ascending" ? "descending" : this.groupSort === "descending" ? "none" : "ascending")}>
                                Groups {this.groupSort === "ascending" ? <FontAwesomeIcon icon={"caret-up"} size={"xs"} />
                                    : this.groupSort === "descending" ? <FontAwesomeIcon icon={"caret-down"} size={"xs"} />
                                        : <FontAwesomeIcon icon={"caret-right"} size={"xs"} />}

                            </div>
                            <div className={"groups-list"}>
                                {groupListContents}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        );
    }

    render() {
        return <MainViewModal
            contents={this.sharingInterface}
            isDisplayed={this.isOpen}
            interactive={true}
            dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
            overlayDisplayedOpacity={this.overlayOpacity}
            closeOnExternalClick={this.close}
        />;
    }
}