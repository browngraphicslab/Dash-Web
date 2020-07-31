import { observable, runInAction, action } from "mobx";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { Doc, Opt, DocListCastAsync, AclAdmin, DataSym, AclPrivate } from "../../fields/Doc";
import { DocServer } from "../DocServer";
import { Cast, StrCast } from "../../fields/Types";
import * as RequestPromise from "request-promise";
import { Utils } from "../../Utils";
import "./SharingManager.scss";
import { observer } from "mobx-react";
import * as fa from '@fortawesome/free-solid-svg-icons';
import { DocumentView } from "../views/nodes/DocumentView";
import { SelectionManager } from "./SelectionManager";
import { DocumentManager } from "./DocumentManager";
import { CollectionView } from "../views/collections/CollectionView";
import { DictationOverlay } from "../views/DictationOverlay";
import GroupManager, { UserOptions } from "./GroupManager";
import GroupMemberView from "./GroupMemberView";
import Select from "react-select";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { List } from "../../fields/List";
import { distributeAcls, SharingPermissions, GetEffectiveAcl } from "../../fields/util";
import { TaskCompletionBox } from "../views/nodes/TaskCompletedBox";

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

/**
 * A user who also has a notificationDoc.
 */
interface ValidatedUser {
    user: User;
    notificationDoc: Doc;
}

const storage = "data";

@observer
export default class SharingManager extends React.Component<{}> {
    public static Instance: SharingManager;
    @observable private isOpen = false; // whether the SharingManager modal is open or not
    @observable private users: ValidatedUser[] = []; // the list of users with notificationDocs
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



    // private get linkVisible() {
    //     return this.sharingDoc ? this.sharingDoc[PublicKey] !== SharingPermissions.None : false;
    // }

    public open = (target: DocumentView) => {
        runInAction(() => this.users = []);
        // SelectionManager.DeselectAll();
        this.populateUsers();
        runInAction(() => {
            this.targetDocView = target;
            this.targetDoc = target.props.Document;
            DictationOverlay.Instance.hasActiveModal = true;
            this.isOpen = true;
            this.permissions = SharingPermissions.Edit;
        });

    }

    public close = action(() => {
        this.isOpen = false;
        this.users = [];
        this.selectedUsers = null; // resets the list of users and seleected users (in the react-select component)

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
     * Populates the list of validated users (this.users) by adding registered users which have a rightSidebarCollection.
     */
    populateUsers = async () => {
        runInAction(() => this.users = []);
        const userList = await RequestPromise.get(Utils.prepend("/getUsers"));
        const raw = JSON.parse(userList) as User[];
        const evaluating = raw.map(async user => {
            const isCandidate = user.email !== Doc.CurrentUserEmail;
            if (isCandidate) {
                const userDocument = await DocServer.GetRefField(user.userDocumentId);
                if (userDocument instanceof Doc) {
                    const notificationDoc = await Cast(userDocument.rightSidebarCollection, Doc);
                    runInAction(() => {
                        if (notificationDoc instanceof Doc) {
                            this.users.push({ user, notificationDoc });
                        }
                    });
                }
            }
        });
        return Promise.all(evaluating);
    }

    /**
     * Sets the permission on the target for the group.
     * @param group 
     * @param permission 
     */
    setInternalGroupSharing = (group: Doc, permission: string) => {
        const members: string[] = JSON.parse(StrCast(group.members));
        const users: ValidatedUser[] = this.users.filter(({ user: { email } }) => members.includes(email));

        const target = this.targetDoc!;
        const ACL = `ACL-${StrCast(group.groupName)}`;

        target.author === Doc.CurrentUserEmail && distributeAcls(ACL, permission as SharingPermissions, target);

        // if documents have been shared, add the target to that list if it doesn't already exist, otherwise create a new list with the target
        group.docsShared ? DocListCastAsync(group.docsShared).then(resolved => Doc.IndexOf(target, resolved!) === -1 && (group.docsShared as List<Doc>).push(target)) : group.docsShared = new List<Doc>([target]);

        users.forEach(({ notificationDoc }) => {
            DocListCastAsync(notificationDoc[storage]).then(resolved => {
                if (permission !== SharingPermissions.None) Doc.IndexOf(target, resolved!) === -1 && Doc.AddDocToList(notificationDoc, storage, target); // add the target to the notificationDoc if it hasn't already been added
                else Doc.IndexOf(target, resolved!) !== -1 && Doc.RemoveDocFromList(notificationDoc, storage, target); // remove the target from the list if it already exists
            });
        });
    }

    /**
     * Shares the documents shared with a group with a new user who has been added to that group.
     * @param group 
     * @param emailId 
     */
    shareWithAddedMember = (group: Doc, emailId: string) => {
        const user: ValidatedUser = this.users.find(({ user: { email } }) => email === emailId)!;

        if (group.docsShared) {
            DocListCastAsync(group.docsShared).then(docsShared => {
                docsShared?.forEach(doc => {
                    DocListCastAsync(user.notificationDoc[storage]).then(resolved => Doc.IndexOf(doc, resolved!) === -1 && Doc.AddDocToList(user.notificationDoc, storage, doc)); // add the doc if it isn't already in the list
                });
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
            DocListCastAsync(group.docsShared).then(docsShared => {
                docsShared?.forEach(doc => {
                    DocListCastAsync(user.notificationDoc[storage]).then(resolved => Doc.IndexOf(doc, resolved!) !== -1 && Doc.RemoveDocFromList(user.notificationDoc, storage, doc)); // remove the doc only if it is in the list
                });
            });
        }
    }

    /**
     * Removes a group's permissions from documents that have been shared with it.
     * @param group 
     */
    removeGroup = (group: Doc) => {
        if (group.docsShared) {
            DocListCastAsync(group.docsShared).then(resolved => {
                resolved?.forEach(doc => {
                    const ACL = `ACL-${StrCast(group.groupName)}`;

                    distributeAcls(ACL, SharingPermissions.None, doc);

                    const members: string[] = JSON.parse(StrCast(group.members));
                    const users: ValidatedUser[] = this.users.filter(({ user: { email } }) => members.includes(email));

                    users.forEach(({ notificationDoc }) => Doc.RemoveDocFromList(notificationDoc, storage, doc));
                });

            });
        }
    }

    setInternalSharing = (recipient: ValidatedUser, permission: string) => {
        const { user, notificationDoc } = recipient;
        const target = this.targetDoc!;
        const key = user.email.replace('.', '_');
        const ACL = `ACL-${key}`;

        target.author === Doc.CurrentUserEmail && distributeAcls(ACL, permission as SharingPermissions, target);

        if (permission !== SharingPermissions.None) {
            DocListCastAsync(notificationDoc[storage]).then(resolved => {
                Doc.IndexOf(target, resolved!) === -1 && Doc.AddDocToList(notificationDoc, storage, target);
            });
        }
        else {
            DocListCastAsync(notificationDoc[storage]).then(resolved => {
                Doc.IndexOf(target, resolved!) !== -1 && Doc.RemoveDocFromList(notificationDoc, storage, target);
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

    private get sharingOptions() {
        return Object.values(SharingPermissions).map(permission => {
            return (
                <option key={permission} value={permission} selected={permission === SharingPermissions.Edit}>
                    {permission}
                </option>
            );
        });
    }

    private focusOn = (contents: string) => {
        const title = this.targetDoc ? StrCast(this.targetDoc.title) : "";
        return (
            <span
                className={"focus-span"}
                title={title}
                onClick={() => {
                    let context: Opt<CollectionView>;
                    if (this.targetDoc && this.targetDocView && (context = this.targetDocView.props.ContainingCollectionView)) {
                        DocumentManager.Instance.jumpToDocument(this.targetDoc, true, undefined, context.props.Document);
                    }
                }}
                onPointerEnter={action(() => {
                    if (this.targetDoc) {
                        Doc.BrushDoc(this.targetDoc);
                        this.dialogueBoxOpacity = 0.1;
                        this.overlayOpacity = 0.1;
                    }
                })}
                onPointerLeave={action(() => {
                    this.targetDoc && Doc.UnBrushDoc(this.targetDoc);
                    this.dialogueBoxOpacity = 1;
                    this.overlayOpacity = 0.4;
                })}
            >
                {contents}
            </span>
        );
    }

    @action
    handleUsersChange = (selectedOptions: any) => {
        this.selectedUsers = selectedOptions as UserOptions[];
    }

    @action
    handlePermissionsChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        this.permissions = event.currentTarget.value as SharingPermissions;
    }

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

    sortUsers = (u1: ValidatedUser, u2: ValidatedUser) => {
        const { email: e1 } = u1.user;
        const { email: e2 } = u2.user;
        return e1 < e2 ? -1 : e1 === e2 ? 0 : 1;
    }

    sortGroups = (group1: Doc, group2: Doc) => {
        const g1 = StrCast(group1.groupName);
        const g2 = StrCast(group2.groupName);
        return g1 < g2 ? -1 : g1 === g2 ? 0 : 1;
    }

    private get sharingInterface() {
        const groupList = GroupManager.Instance?.getAllGroups() || [];

        const sortedUsers = this.users.sort(this.sortUsers)
            .map(({ user: { email } }) => ({ label: email, value: indType + email }));
        const sortedGroups = groupList.sort(this.sortGroups)
            .map(({ groupName }) => ({ label: StrCast(groupName), value: groupType + StrCast(groupName) }));

        const options: GroupedOptions[] = [];

        if (GroupManager.Instance) {
            if ((this.showUserOptions && this.showGroupOptions) || (!this.showUserOptions && !this.showGroupOptions)) {
                options.push({
                    label: 'Individuals',
                    options: sortedUsers
                },
                    {
                        label: 'Groups',
                        options: sortedGroups
                    });
            }
            else if (this.showUserOptions) {
                options.push({
                    label: 'Individuals',
                    options: sortedUsers
                });
            }
            else {
                options.push({
                    label: 'Groups',
                    options: sortedGroups
                });
            }
        }

        const users = this.individualSort === "ascending" ? this.users.sort(this.sortUsers) : this.individualSort === "descending" ? this.users.sort(this.sortUsers).reverse() : this.users;
        const groups = this.groupSort === "ascending" ? groupList.sort(this.sortGroups) : this.groupSort === "descending" ? groupList.sort(this.sortGroups).reverse() : groupList;

        const effectiveAcl = this.targetDoc ? GetEffectiveAcl(this.targetDoc) : AclPrivate;

        const userListContents: (JSX.Element | null)[] = users.map(({ user, notificationDoc }) => {
            const userKey = user.email.replace('.', '_');
            const permissions = StrCast(this.targetDoc?.[`ACL-${userKey}`]);

            return !permissions || user.email === this.targetDoc?.author ? null : (
                <div
                    key={userKey}
                    className={"container"}
                >
                    <span className={"padding"}>{user.email}</span>
                    <div className="edit-actions">
                        {effectiveAcl === AclAdmin ? (
                            <select
                                className={"permissions-dropdown"}
                                value={permissions}
                                onChange={e => this.setInternalSharing({ user, notificationDoc }, e.currentTarget.value)}
                            >
                                {this.sharingOptions}
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

        userListContents.unshift(
            (
                <div
                    key={"owner"}
                    className={"container"}
                >
                    <span className={"padding"}>{this.targetDoc?.author === Doc.CurrentUserEmail ? "Me" : this.targetDoc?.author}</span>
                    <div className="edit-actions">
                        <div className={"permissions-dropdown"}>
                            Owner
                        </div>
                    </div>
                </div>
            ),
            this.targetDoc?.author !== Doc.CurrentUserEmail ?
                (
                    <div
                        key={"me"}
                        className={"container"}
                    >
                        <span className={"padding"}>Me</span>
                        <div className="edit-actions">
                            <div className={"permissions-dropdown"}>
                                {this.targetDoc?.[`ACL-${Doc.CurrentUserEmail.replace(".", "_")}`]}
                            </div>
                        </div>
                    </div>
                ) : null
        );

        const groupListContents = groups.map(group => {
            const permissions = StrCast(this.targetDoc?.[`ACL-${StrCast(group.groupName)}`], SharingPermissions.None);

            return permissions === SharingPermissions.None ? null : (
                <div
                    key={StrCast(group.groupName)}
                    className={"container"}
                >
                    <div className={"padding"}>{group.groupName}</div>
                    <div className="group-info" onClick={action(() => GroupManager.Instance.currentGroup = group)}>
                        <FontAwesomeIcon icon={fa.faInfoCircle} color={"#e8e8e8"} size={"sm"} style={{ backgroundColor: "#1e89d7", borderRadius: "100%", border: "1px solid #1e89d7" }} />
                    </div>
                    <div className="edit-actions">
                        <select
                            className={"permissions-dropdown"}
                            value={permissions}
                            onChange={e => this.setInternalGroupSharing(group, e.currentTarget.value)}
                        >
                            {this.sharingOptions}
                        </select>
                    </div>
                </div>
            );
        });

        const displayGroupList = !groupListContents?.every(group => group === null);

        return (
            <div className={"sharing-interface"}>
                {GroupManager.Instance?.currentGroup ?
                    <GroupMemberView
                        group={GroupManager.Instance.currentGroup}
                        onCloseButtonClick={action(() => GroupManager.Instance.currentGroup = undefined)}
                    /> :
                    null}
                {/* <p className={"share-link"}>Manage the public link to {this.focusOn("this document...")}</p>
                {!this.linkVisible ? (null) :
                    <div className={"link-container"}>
                        <div className={"link-box"} onClick={this.copy}>{this.sharingUrl}</div>
                        <div
                            title={"Copy link to clipboard"}
                            className={"copy"}
                            style={{ backgroundColor: this.copied ? "lawngreen" : "gainsboro" }}
                            onClick={this.copy}
                        >
                            <FontAwesomeIcon icon={fa.faCopy} />
                        </div>
                    </div>
                }
                <div className={"people-with-container"}>
                    {!this.linkVisible ? (null) : <p className={"people-with"}>People with this link</p>}
                    <select
                        className={"people-with-select"}
                        value={this.sharingDoc ? StrCast(this.sharingDoc[PublicKey], SharingPermissions.None) : SharingPermissions.None}
                        style={{
                            marginLeft: this.linkVisible ? 10 : 0,
                            color: this.sharingDoc ? ColorMapping.get(StrCast(this.sharingDoc[PublicKey], SharingPermissions.None)) : DefaultColor,
                            borderColor: this.sharingDoc ? ColorMapping.get(StrCast(this.sharingDoc[PublicKey], SharingPermissions.None)) : DefaultColor
                        }}
                        onChange={e => this.setExternalSharing(e.currentTarget.value)}
                    >
                        {this.sharingOptions}
                    </select>
                </div>
                <div className={"hr-substitute"} /> */}
                <div className="sharing-contents">
                    <p className={"share-title"}><b>Share </b>{this.focusOn(StrCast(this.targetDoc?.title, "this document"))}</p>
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
                            <select className="permissions-select" onChange={this.handlePermissionsChange}>
                                {this.sharingOptions}
                            </select>
                            <button ref={this.shareDocumentButtonRef} className="share-button" onClick={this.share}>
                                Share
                            </button>
                        </div>
                        <div className="sort-checkboxes">
                            <input type="checkbox" onChange={action(() => this.showUserOptions = !this.showUserOptions)} /> <label style={{ marginRight: 10 }}>Individuals</label>
                            <input type="checkbox" onChange={action(() => this.showGroupOptions = !this.showGroupOptions)} /> <label>Groups</label>
                        </div>
                    </div>
                    }
                    <div className="main-container">
                        <div className={"individual-container"}>
                            <div
                                className="user-sort"
                                onClick={action(() => this.individualSort = this.individualSort === "ascending" ? "descending" : this.individualSort === "descending" ? "none" : "ascending")}>
                                Individuals {this.individualSort === "ascending" ? "↑" : this.individualSort === "descending" ? "↓" : ""} {/* → */}
                            </div>
                            <div className={"users-list"} style={{ display: "block" }}>{/*200*/}
                                {userListContents}
                            </div>
                        </div>
                        <div className={"group-container"}>
                            <div
                                className="user-sort"
                                onClick={action(() => this.groupSort = this.groupSort === "ascending" ? "descending" : this.groupSort === "descending" ? "none" : "ascending")}>
                                Groups {this.groupSort === "ascending" ? "↑" : this.groupSort === "descending" ? "↓" : ""} {/* → */}

                            </div>
                            <div className={"groups-list"} style={{ display: !displayGroupList ? "flex" : "block" }}>{/*200*/}
                                {
                                    !displayGroupList ?
                                        <div
                                            className={"none"}
                                        >
                                            There are no groups this document has been shared with.
                                            </div>
                                        :
                                        groupListContents
                                }

                            </div>
                        </div>
                    </div>

                </div>
            </div>
        );
    }

    render() {
        return (
            <MainViewModal
                contents={this.sharingInterface}
                isDisplayed={this.isOpen}
                interactive={true}
                dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                overlayDisplayedOpacity={this.overlayOpacity}
                closeOnExternalClick={this.close}
            />
        );
    }

}