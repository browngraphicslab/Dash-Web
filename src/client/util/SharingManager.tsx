import { observable, runInAction, action } from "mobx";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { Doc, Opt, DocListCastAsync } from "../../fields/Doc";
import { DocServer } from "../DocServer";
import { Cast, StrCast } from "../../fields/Types";
import * as RequestPromise from "request-promise";
import { Utils } from "../../Utils";
import "./SharingManager.scss";
import { observer } from "mobx-react";
import { library } from '@fortawesome/fontawesome-svg-core';
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
import { distributeAcls, SharingPermissions } from "../../fields/util";
import { TaskCompletionBox } from "../views/nodes/TaskCompletedBox";

library.add(fa.faCopy, fa.faTimes);

export interface User {
    email: string;
    userDocumentId: string;
}

interface GroupOptions {
    label: string;
    options: UserOptions[];
}

// const SharingKey = "sharingPermissions";
// const PublicKey = "publicLinkPermissions";
// const DefaultColor = "black";

const groupType = "!groupType/";
const indType = "!indType/";

interface ValidatedUser {
    user: User;
    notificationDoc: Doc;
}

const storage = "data";

@observer
export default class SharingManager extends React.Component<{}> {
    public static Instance: SharingManager;
    @observable private isOpen = false;
    @observable private users: ValidatedUser[] = [];
    @observable private targetDoc: Doc | undefined;
    @observable private targetDocView: DocumentView | undefined;
    // @observable private copied = false;
    @observable private dialogueBoxOpacity = 1;
    @observable private overlayOpacity = 0.4;
    @observable private selectedUsers: UserOptions[] | null = null;
    @observable private permissions: SharingPermissions = SharingPermissions.Edit;
    @observable private individualSort: "ascending" | "descending" | "none" = "none";
    @observable private groupSort: "ascending" | "descending" | "none" = "none";
    private shareDocumentButtonRef: React.RefObject<HTMLButtonElement> = React.createRef();



    // private get linkVisible() {
    //     return this.sharingDoc ? this.sharingDoc[PublicKey] !== SharingPermissions.None : false;
    // }

    public open = (target: DocumentView) => {
        SelectionManager.DeselectAll();
        this.populateUsers().then(action(() => {
            this.targetDocView = target;
            this.targetDoc = target.props.Document;
            DictationOverlay.Instance.hasActiveModal = true;
            this.isOpen = true;
            this.permissions = SharingPermissions.Edit;
        }));

    }

    public close = action(() => {
        this.isOpen = false;
        this.users = [];
        this.selectedUsers = null;

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

    populateUsers = async () => {
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

    setInternalGroupSharing = (group: Doc, permission: string) => {
        const members: string[] = JSON.parse(StrCast(group.members));
        const users: ValidatedUser[] = this.users.filter(({ user: { email } }) => members.includes(email));

        const target = this.targetDoc!;
        const ACL = `ACL-${StrCast(group.groupName)}`;
        // fix this - not needed (here and setinternalsharing and removegroup)
        // target[ACL] = permission;
        // Doc.GetProto(target)[ACL] = permission;

        distributeAcls(ACL, permission as SharingPermissions, this.targetDoc!);

        group.docsShared ? DocListCastAsync(group.docsShared).then(resolved => Doc.IndexOf(target, resolved!) === -1 && (group.docsShared as List<Doc>).push(target)) : group.docsShared = new List<Doc>([target]);

        users.forEach(({ notificationDoc }) => {
            DocListCastAsync(notificationDoc[storage]).then(resolved => {
                if (permission !== SharingPermissions.None) Doc.IndexOf(target, resolved!) === -1 && Doc.AddDocToList(notificationDoc, storage, target);
                else Doc.IndexOf(target, resolved!) !== -1 && Doc.RemoveDocFromList(notificationDoc, storage, target);
            });
        });
    }

    shareWithAddedMember = (group: Doc, emailId: string) => {
        const user: ValidatedUser = this.users.find(({ user: { email } }) => email === emailId)!;

        if (group.docsShared) {
            DocListCastAsync(group.docsShared).then(docsShared => {
                docsShared?.forEach(doc => {
                    DocListCastAsync(user.notificationDoc[storage]).then(resolved => Doc.IndexOf(doc, resolved!) === -1 && Doc.AddDocToList(user.notificationDoc, storage, doc));
                });
            });
        }
    }

    removeMember = (group: Doc, emailId: string) => {
        const user: ValidatedUser = this.users.find(({ user: { email } }) => email === emailId)!;

        if (group.docsShared) {
            DocListCastAsync(group.docsShared).then(docsShared => {
                docsShared?.forEach(doc => {
                    DocListCastAsync(user.notificationDoc[storage]).then(resolved => Doc.IndexOf(doc, resolved!) !== -1 && Doc.RemoveDocFromList(user.notificationDoc, storage, doc));
                });
            });
        }
    }

    removeGroup = (group: Doc) => {
        if (group.docsShared) {
            DocListCastAsync(group.docsShared).then(resolved => {
                resolved?.forEach(doc => {
                    const ACL = `ACL-${StrCast(group.groupName)}`;
                    // doc[ACL] = doc[DataSym][ACL] = "Not Shared";

                    distributeAcls(ACL, SharingPermissions.None, doc);

                    const members: string[] = JSON.parse(StrCast(group.members));
                    const users: ValidatedUser[] = this.users.filter(({ user: { email } }) => members.includes(email));

                    users.forEach(({ notificationDoc }) => Doc.RemoveDocFromList(notificationDoc, storage, doc));
                });

            });
        }
    }

    // @action
    setInternalSharing = (recipient: ValidatedUser, permission: string) => {
        const { user, notificationDoc } = recipient;
        const target = this.targetDoc!;
        const key = user.email.replace('.', '_');
        const ACL = `ACL-${key}`;

        distributeAcls(ACL, permission as SharingPermissions, this.targetDoc!);

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

        const options: GroupOptions[] = GroupManager.Instance ?
            [
                {
                    label: 'Individuals',
                    options: sortedUsers
                },
                {
                    label: 'Groups',
                    options: sortedGroups
                }
            ]
            : [];

        const users = this.individualSort === "ascending" ? this.users.sort(this.sortUsers) : this.individualSort === "descending" ? this.users.sort(this.sortUsers).reverse() : this.users;
        const groups = this.groupSort === "ascending" ? groupList.sort(this.sortGroups) : this.groupSort === "descending" ? groupList.sort(this.sortGroups).reverse() : groupList;

        const userListContents: (JSX.Element | null)[] = users.map(({ user, notificationDoc }) => {
            const userKey = user.email.replace('.', '_');
            const permissions = StrCast(this.targetDoc?.[`ACL-${userKey}`], SharingPermissions.None);

            return permissions === SharingPermissions.None || user.email === this.targetDoc?.author ? null : (
                <div
                    key={userKey}
                    className={"container"}
                >
                    <span className={"padding"}>{user.email}</span>
                    <div className="edit-actions">
                        <select
                            className={"permissions-dropdown"}
                            value={permissions}
                            onChange={e => this.setInternalSharing({ user, notificationDoc }, e.currentTarget.value)}
                        >
                            {this.sharingOptions}
                        </select>
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
                    <span className={"padding"}>{this.targetDoc?.author}</span>
                    <div className="edit-actions">
                        <div className={"permissions-dropdown"}>
                            Owner
                        </div>
                    </div>
                </div>
            )
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

        const displayUserList = !userListContents?.every(user => user === null);
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
                        <FontAwesomeIcon icon={fa.faTimes} color={"black"} size={"lg"} />
                    </div>
                    {this.targetDoc?.author !== Doc.CurrentUserEmail ? null
                        :
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
                    }
                    <div className="main-container">
                        <div className={"individual-container"}>
                            <div
                                className="user-sort"
                                onClick={action(() => this.individualSort = this.individualSort === "ascending" ? "descending" : this.individualSort === "descending" ? "none" : "ascending")}>
                                Individuals {this.individualSort === "ascending" ? "↑" : this.individualSort === "descending" ? "↓" : ""} {/* → */}
                            </div>
                            <div className={"users-list"} style={{ display: !displayUserList ? "flex" : "block" }}>{/*200*/}
                                {
                                    !displayUserList ?
                                        <div
                                            className={"none"}
                                        >
                                            There are no users this document has been shared with.
                                        </div>
                                        :
                                        userListContents
                                }
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