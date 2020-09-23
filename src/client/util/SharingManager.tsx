import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable, runInAction, computed } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import Select from "react-select";
import * as RequestPromise from "request-promise";
import { AclAdmin, AclPrivate, DataSym, Doc, DocListCast, Opt, AclSym } from "../../fields/Doc";
import { List } from "../../fields/List";
import { Cast, StrCast } from "../../fields/Types";
import { distributeAcls, GetEffectiveAcl, SharingPermissions, TraceMobx } from "../../fields/util";
import { Utils } from "../../Utils";
import { DocServer } from "../DocServer";
import { CollectionView } from "../views/collections/CollectionView";
import { DictationOverlay } from "../views/DictationOverlay";
import { MainViewModal } from "../views/MainViewModal";
import { DocumentView } from "../views/nodes/DocumentView";
import { TaskCompletionBox } from "../views/nodes/TaskCompletedBox";
import { DocumentManager } from "./DocumentManager";
import { GroupManager, UserOptions } from "./GroupManager";
import { GroupMemberView } from "./GroupMemberView";
import "./SharingManager.scss";
import { SelectionManager } from "./SelectionManager";
import { intersection } from "lodash";

export interface User {
    email: string;
    userDocumentId: string;
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
 * A user who also has a notificationDoc.
 */
interface ValidatedUser {
    user: User;
    notificationDoc: Doc;
    userColor: string;
}


@observer
export class SharingManager extends React.Component<{}> {
    public static Instance: SharingManager;
    @observable private isOpen = false; // whether the SharingManager modal is open or not
    @observable public users: ValidatedUser[] = []; // the list of users with notificationDocs
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
    // if both showUserOptions and showGroupOptions are false then both are displayed
    @observable private showUserOptions: boolean = false; // whether to show individuals as options when sharing (in the react-select component)
    @observable private showGroupOptions: boolean = false; // // whether to show groups as options when sharing (in the react-select component)
    private populating: boolean = false; // whether the list of users is populating or not
    @observable private layoutDocAcls: boolean = false; // whether the layout doc or data doc's acls are to be used

    // private get linkVisible() {
    //     return this.sharingDoc ? this.sharingDoc[PublicKey] !== SharingPermissions.None : false;
    // }

    public open = (target?: DocumentView, target_doc?: Doc) => {
        runInAction(() => this.users = []);
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
     * Populates the list of validated users (this.users) by adding registered users which have a mySharedDocs.
     */
    populateUsers = async () => {
        if (!this.populating) {
            this.populating = true;
            runInAction(() => this.users = []);
            const userList = await RequestPromise.get(Utils.prepend("/getUsers"));
            const raw = JSON.parse(userList) as User[];
            const evaluating = raw.map(async user => {
                const isCandidate = user.email !== Doc.CurrentUserEmail;
                if (isCandidate) {
                    const userDocument = await DocServer.GetRefField(user.userDocumentId);
                    if (userDocument instanceof Doc) {
                        const notificationDoc = await Cast(userDocument.mySharedDocs, Doc);
                        const userColor = StrCast(userDocument.userColor);
                        runInAction(() => {
                            if (notificationDoc instanceof Doc) {
                                this.users.push({ user, notificationDoc, userColor });
                            }
                        });
                    }
                }
            });
            return Promise.all(evaluating).then(() => this.populating = false);
        }
    }

    /**
     * Sets the permission on the target for the group.
     * @param group 
     * @param permission 
     */
    setInternalGroupSharing = (group: Doc | { groupName: string }, permission: string, targetDoc?: Doc) => {

        const target = targetDoc || this.targetDoc!;
        const key = StrCast(group.groupName).replace(".", "_");
        const acl = `acl-${key}`;

        const docs = SelectionManager.SelectedDocuments().length < 2 ? [target] : SelectionManager.SelectedDocuments().map(docView => docView.props.Document);

        docs.forEach(doc => {
            doc.author === Doc.CurrentUserEmail && !doc[`acl-${Doc.CurrentUserEmail.replace(".", "_")}`] && distributeAcls(`acl-${Doc.CurrentUserEmail.replace(".", "_")}`, SharingPermissions.Admin, doc);
            GetEffectiveAcl(doc) === AclAdmin && distributeAcls(acl, permission as SharingPermissions, doc);

            if (group instanceof Doc) {
                const members: string[] = JSON.parse(StrCast(group.members));
                const users: ValidatedUser[] = this.users.filter(({ user: { email } }) => members.includes(email));

                // if documents have been shared, add the doc to that list if it doesn't already exist, otherwise create a new list with the doc
                group.docsShared ? Doc.IndexOf(doc, DocListCast(group.docsShared)) === -1 && (group.docsShared as List<Doc>).push(doc) : group.docsShared = new List<Doc>([doc]);

                users.forEach(({ user, notificationDoc }) => {
                    if (permission !== SharingPermissions.None) Doc.IndexOf(doc, DocListCast(notificationDoc[storage])) === -1 && Doc.AddDocToList(notificationDoc, storage, doc); // add the doc to the notificationDoc if it hasn't already been added
                    else GetEffectiveAcl(doc, undefined, user.email) === AclPrivate && Doc.IndexOf((doc.aliasOf as Doc || doc), DocListCast(notificationDoc[storage])) !== -1 && Doc.RemoveDocFromList(notificationDoc, storage, (doc.aliasOf as Doc || doc)); // remove the doc from the list if it already exists
                });
            }
        });
    }

    /**
     * Shares the documents shared with a group with a new user who has been added to that group.
     * @param group 
     * @param emailId 
     */
    shareWithAddedMember = (group: Doc, emailId: string) => {
        const user: ValidatedUser = this.users.find(({ user: { email } }) => email === emailId)!;
        if (group.docsShared) DocListCast(group.docsShared).forEach(doc => Doc.IndexOf(doc, DocListCast(user.notificationDoc[storage])) === -1 && Doc.AddDocToList(user.notificationDoc, storage, doc));
    }

    /**
     * Called from the properties sidebar to change permissions of a user.
     */
    shareFromPropertiesSidebar = (shareWith: string, permission: SharingPermissions, docs: Doc[]) => {
        if (shareWith !== "Public") {
            const user = this.users.find(({ user: { email } }) => email === (shareWith === "Me" ? Doc.CurrentUserEmail : shareWith));
            docs.forEach(doc => {
                if (user) this.setInternalSharing(user, permission, doc);
                else this.setInternalGroupSharing(GroupManager.Instance.getGroup(shareWith)!, permission, doc);
            });
        }
        else {
            docs.forEach(doc => {
                if (GetEffectiveAcl(doc) === AclAdmin) distributeAcls("acl-Public", permission, doc);
            });
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
            DocListCast(group.docsShared).forEach(doc => {
                Doc.IndexOf(doc, DocListCast(user.notificationDoc[storage])) !== -1 && Doc.RemoveDocFromList(user.notificationDoc, storage, doc); // remove the doc only if it is in the list
            });
        }
    }

    /**
     * Removes a group's permissions from documents that have been shared with it.
     * @param group 
     */
    removeGroup = (group: Doc) => {
        if (group.docsShared) {
            DocListCast(group.docsShared).forEach(doc => {
                const acl = `acl-${StrCast(group.groupName)}`;

                distributeAcls(acl, SharingPermissions.None, doc);

                const members: string[] = JSON.parse(StrCast(group.members));
                const users: ValidatedUser[] = this.users.filter(({ user: { email } }) => members.includes(email));

                users.forEach(({ notificationDoc }) => Doc.RemoveDocFromList(notificationDoc, storage, doc));
            });
        }
    }

    /**
     * Shares the document with a user.
     */
    setInternalSharing = (recipient: ValidatedUser, permission: string, targetDoc?: Doc) => {
        const { user, notificationDoc } = recipient;
        const target = targetDoc || this.targetDoc!;
        const key = user.email.replace('.', '_');
        const acl = `acl-${key}`;


        const docs = SelectionManager.SelectedDocuments().length < 2 ? [target] : SelectionManager.SelectedDocuments().map(docView => docView.props.Document);

        docs.forEach(doc => {
            doc.author === Doc.CurrentUserEmail && !doc[`acl-${Doc.CurrentUserEmail.replace(".", "_")}`] && distributeAcls(`acl-${Doc.CurrentUserEmail.replace(".", "_")}`, SharingPermissions.Admin, doc);
            GetEffectiveAcl(doc) === AclAdmin && distributeAcls(acl, permission as SharingPermissions, doc);

            if (permission !== SharingPermissions.None) Doc.IndexOf(doc, DocListCast(notificationDoc[storage])) === -1 && Doc.AddDocToList(notificationDoc, storage, doc);
            else GetEffectiveAcl(doc, undefined, user.email) === AclPrivate && Doc.IndexOf((doc.aliasOf as Doc || doc), DocListCast(notificationDoc[storage])) !== -1 && Doc.RemoveDocFromList(notificationDoc, storage, (doc.aliasOf as Doc || doc));
        });
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
    private sharingOptions(uniform: boolean) {
        const dropdownValues: string[] = Object.values(SharingPermissions);
        if (!uniform) dropdownValues.unshift("-multiple-");
        return dropdownValues.map(permission =>
            (
                <option key={permission} value={permission}>
                    {permission}
                </option>
            )
        );
    }

    private focusOn = (contents: string) => {
        const title = this.targetDoc ? StrCast(this.targetDoc.title) : "";
        const docs = SelectionManager.SelectedDocuments().length > 1 ? SelectionManager.SelectedDocuments().map(docView => docView.props.Document) : [this.targetDoc];
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
        const g1 = StrCast(group1.groupName);
        const g2 = StrCast(group2.groupName);
        return g1 < g2 ? -1 : g1 === g2 ? 0 : 1;
    }

    /**
     * @returns the main interface of the SharingManager.
     */
    @computed get sharingInterface() {
        TraceMobx();
        const groupList = GroupManager.Instance?.getAllGroups() || [];
        const sortedUsers = this.users.slice().sort(this.sortUsers).map(({ user: { email } }) => ({ label: email, value: indType + email }));
        const sortedGroups = groupList.slice().sort(this.sortGroups).map(({ groupName }) => ({ label: StrCast(groupName), value: groupType + StrCast(groupName) }));

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
        const docs = SelectionManager.SelectedDocuments().length < 2 ?
            [this.layoutDocAcls ? this.targetDoc : this.targetDoc?.[DataSym]]
            : SelectionManager.SelectedDocuments().map(docView => this.layoutDocAcls ? docView.props.Document : docView.props.Document?.[DataSym]);

        const targetDoc = docs[0];

        // tslint:disable-next-line: no-unnecessary-callback-wrapper
        const admin = docs.map(doc => GetEffectiveAcl(doc)).every(acl => acl === AclAdmin); // if the user has admin access to all selected docs

        // users in common between all docs
        const commonKeys = intersection(...docs.map(doc => this.layoutDocAcls ? doc?.[AclSym] && Object.keys(doc[AclSym]) : doc?.[DataSym]?.[AclSym] && Object.keys(doc[DataSym][AclSym])));

        // the list of users shared with
        const userListContents: (JSX.Element | null)[] = users.filter(({ user }) => docs.length > 1 ? commonKeys.includes(`acl-${user.email.replace('.', '_')}`) : true).map(({ user, notificationDoc, userColor }) => {
            const userKey = `acl-${user.email.replace('.', '_')}`;
            const uniform = docs.every(doc => this.layoutDocAcls ? doc?.[AclSym]?.[userKey] === docs[0]?.[AclSym]?.[userKey] : doc?.[DataSym]?.[AclSym]?.[userKey] === docs[0]?.[DataSym]?.[AclSym]?.[userKey]);
            const permissions = uniform ? StrCast(targetDoc?.[userKey]) : "-multiple-";

            return !permissions ? (null) : (
                <div
                    key={userKey}
                    className={"container"}
                >
                    <span className={"padding"}>{user.email}</span>
                    <div className="edit-actions">
                        {admin ? (
                            <select
                                className={"permissions-dropdown"}
                                value={permissions}
                                onChange={e => this.setInternalSharing({ user, notificationDoc, userColor }, e.currentTarget.value)}
                            >
                                {this.sharingOptions(uniform)}
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
                                {targetDoc?.[`acl-${Doc.CurrentUserEmail.replace(".", "_")}`]}
                            </div>
                        </div>
                    </div>
                ) : null
        );


        // the list of groups shared with
        const groupListMap: (Doc | { groupName: string })[] = groups.filter(({ groupName }) => docs.length > 1 ? commonKeys.includes(`acl-${StrCast(groupName).replace('.', '_')}`) : true);
        groupListMap.unshift({ groupName: "Public" });
        const groupListContents = groupListMap.map(group => {
            const groupKey = `acl-${StrCast(group.groupName)}`;
            const uniform = docs.every(doc => this.layoutDocAcls ? doc?.[AclSym]?.[groupKey] === docs[0]?.[AclSym]?.[groupKey] : doc?.[DataSym]?.[AclSym]?.[groupKey] === docs[0]?.[DataSym]?.[AclSym]?.[groupKey]);
            const permissions = uniform ? StrCast(targetDoc?.[`acl-${StrCast(group.groupName)}`]) : "-multiple-";

            return !permissions ? (null) : (
                <div
                    key={groupKey}
                    className={"container"}
                >
                    <div className={"padding"}>{group.groupName}</div>
                    {group instanceof Doc ?
                        (<div className="group-info" onClick={action(() => GroupManager.Instance.currentGroup = group)}>
                            <FontAwesomeIcon icon={"info-circle"} color={"#e8e8e8"} size={"sm"} style={{ backgroundColor: "#1e89d7", borderRadius: "100%", border: "1px solid #1e89d7" }} />
                        </div>)
                        : (null)}
                    <div className="edit-actions">
                        {admin ? (
                            <select
                                className={"permissions-dropdown"}
                                value={permissions}
                                onChange={e => this.setInternalGroupSharing(group, e.currentTarget.value)}
                            >
                                {this.sharingOptions(uniform)}
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
                                className={"user-search"}
                                placeholder={"Enter user or group name..."}
                                isMulti
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
                        {Doc.UserDoc().noviceMode ? (null) :
                            <div className="layoutDoc-acls">
                                <input type="checkbox" onChange={action(() => this.layoutDocAcls = !this.layoutDocAcls)} checked={this.layoutDocAcls} /> <label>Layout</label>
                            </div>}
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