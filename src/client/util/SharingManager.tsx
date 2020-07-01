import { observable, runInAction, action } from "mobx";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { Doc, Opt, DocCastAsync } from "../../fields/Doc";
import { DocServer } from "../DocServer";
import { Cast, StrCast } from "../../fields/Types";
import * as RequestPromise from "request-promise";
import { Utils } from "../../Utils";
import "./SharingManager.scss";
import { Id } from "../../fields/FieldSymbols";
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

library.add(fa.faCopy);

export interface User {
    email: string;
    userDocumentId: string;
}

export enum SharingPermissions {
    Edit = "Can Edit",
    Add = "Can Add",
    View = "Can View",
    None = "Not Shared"
}

// const ColorMapping = new Map<string, string>([
//     [SharingPermissions.None, "red"],
//     [SharingPermissions.View, "maroon"],
//     [SharingPermissions.Add, "blue"],
//     [SharingPermissions.Edit, "green"]
// ]);

const HierarchyMapping = new Map<string, string>([
    [SharingPermissions.None, "0"],
    [SharingPermissions.View, "1"],
    [SharingPermissions.Add, "2"],
    [SharingPermissions.Edit, "3"],

    ["0", SharingPermissions.None],
    ["1", SharingPermissions.View],
    ["2", SharingPermissions.Add],
    ["3", SharingPermissions.Edit]

]);

interface GroupOptions {
    label: string;
    options: UserOptions[];
}

const SharingKey = "sharingPermissions";
const PublicKey = "publicLinkPermissions";
const DefaultColor = "black";

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
    // @observable private groups: Doc[] = [];
    @observable private targetDoc: Doc | undefined;
    @observable private targetDocView: DocumentView | undefined;
    @observable private copied = false;
    @observable private dialogueBoxOpacity = 1;
    @observable private overlayOpacity = 0.4;
    @observable private selectedUsers: UserOptions[] | null = null;
    @observable private permissions: SharingPermissions = SharingPermissions.None;

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
            if (!this.sharingDoc) {
                this.sharingDoc = new Doc;
            }
        }));

        // runInAction(() => this.groups = GroupManager.Instance.getAllGroups());
    }

    public close = action(() => {
        this.isOpen = false;
        this.users = [];
        setTimeout(action(() => {
            this.copied = false;
            DictationOverlay.Instance.hasActiveModal = false;
            this.targetDoc = undefined;
        }), 500);
    });

    private get sharingDoc() {
        return this.targetDoc ? Cast(this.targetDoc[SharingKey], Doc) as Doc : undefined;
    }

    private set sharingDoc(value: Doc | undefined) {
        this.targetDoc && (this.targetDoc[SharingKey] = value);
    }

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
        const users: ValidatedUser[] = this.users.filter(user => members.includes(user.user.email));

        const sharingDoc = this.sharingDoc!;
        console.log(sharingDoc)
        if (permission === SharingPermissions.None) {
            const metadata = sharingDoc[StrCast(group.groupName)];
            if (metadata) sharingDoc[StrCast(group.groupName)] = undefined;
        }
        else {
            sharingDoc[StrCast(group.groupName)] = permission;
        }

        users.forEach(user => {
            this.setInternalSharing(user, permission, group);
        });
    }

    setInternalSharing = async (recipient: ValidatedUser, state: string, group?: Doc) => {
        const { user, notificationDoc } = recipient;
        const target = this.targetDoc!;
        const manager = this.sharingDoc!;
        const key = user.userDocumentId;

        let metadata = await DocCastAsync(manager[key]);
        const permissions: { [key: string]: number } = metadata?.permissions ? JSON.parse(StrCast(metadata.permissions)) : {};
        permissions[StrCast(group ? group.groupName : Doc.CurrentUserEmail)] = parseInt(HierarchyMapping.get(state)!);
        const max = Math.max(...Object.values(permissions));

        // let max = 0;
        // const keys: string[] = [];
        // for (const [key, value] of Object.entries(permissions)) {
        //     if (value === max && max !== 0) {
        //         keys.push(key);
        //     }
        //     else if (value > max) {
        //         keys.splice(0, keys.length);
        //         keys.push(key);
        //         max = value;
        //     }
        // }

        switch (max) {
            case 0:
                if (metadata) {
                    const sharedAlias = (await DocCastAsync(metadata.sharedAlias))!;
                    Doc.RemoveDocFromList(notificationDoc, storage, sharedAlias);
                    manager[key] = undefined;
                }
                break;

            case 1: case 2: case 3:
                if (!metadata) {
                    metadata = new Doc;
                    const sharedAlias = Doc.MakeAlias(target);
                    Doc.AddDocToList(notificationDoc, storage, sharedAlias);
                    metadata.sharedAlias = sharedAlias;
                    manager[key] = metadata;
                }
                metadata.permissions = JSON.stringify(permissions);
                // metadata.usersShared = JSON.stringify(keys);
                break;
        }

        if (metadata) metadata.maxPermission = HierarchyMapping.get(`${max}`);
    }

    // private setExternalSharing = (state: string) => {
    //     const sharingDoc = this.sharingDoc;
    //     if (!sharingDoc) {
    //         return;
    //     }
    //     sharingDoc[PublicKey] = state;
    // }

    private get sharingUrl() {
        if (!this.targetDoc) {
            return undefined;
        }
        const baseUrl = Utils.prepend("/doc/" + this.targetDoc[Id]);
        return `${baseUrl}?sharing=true`;
    }

    copy = action(() => {
        if (this.sharingUrl) {
            Utils.CopyText(this.sharingUrl);
            this.copied = true;
        }
    });

    private get sharingOptions() {
        return Object.values(SharingPermissions).map(permission => {
            return (
                <option key={permission} value={permission}>
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

    private computePermissions = (userKey: string) => {
        const sharingDoc = this.sharingDoc;
        if (!sharingDoc) {
            return SharingPermissions.None;
        }
        const metadata = sharingDoc[userKey] as Doc | string;
        if (!metadata) {
            return SharingPermissions.None;
        }
        return StrCast(metadata instanceof Doc ? metadata.maxPermission : metadata, SharingPermissions.None);
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
        this.selectedUsers?.forEach(user => {
            if (user.value.includes(indType)) {
                console.log(user);
                console.log(this.users.find(u => u.user.email === user.label));
                this.setInternalSharing(this.users.find(u => u.user.email === user.label)!, this.permissions);
            }
            else {
                this.setInternalGroupSharing(GroupManager.Instance.getGroup(user.label)!, this.permissions);
            }
        });

        this.selectedUsers = null;
    }

    private get sharingInterface() {
        const existOtherUsers = this.users.length > 0;
        const existGroups = GroupManager.Instance?.getAllGroups().length > 0;

        // const manager = this.sharingDoc!;

        const options: GroupOptions[] = GroupManager.Instance ?
            [
                {
                    label: 'Individuals',
                    options: GroupManager.Instance.options.map(({ label, value }) => ({ label, value: "!indType/" + value }))
                },
                {
                    label: 'Groups',
                    options: GroupManager.Instance.getAllGroups().map(({ groupName }) => ({ label: StrCast(groupName), value: "!groupType/" + StrCast(groupName) }))
                }
            ]
            : [];

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
                    <div className="share-setup">
                        <Select
                            className={"user-search"}
                            placeholder={"Enter user or group name..."}
                            isMulti
                            closeMenuOnSelect={false}
                            options={options}
                            onChange={this.handleUsersChange}
                            value={this.selectedUsers}
                        />
                        <select className="permissions-select" onChange={this.handlePermissionsChange}>
                            {this.sharingOptions}
                        </select>
                        <button className="share-button" onClick={this.share}>
                            Share
                        </button>
                    </div>
                    <div className="main-container">
                        <div className={"individual-container"}>
                            <div className={"users-list"} style={{ display: existOtherUsers ? "block" : "flex", minHeight: existOtherUsers ? undefined : 150 }}>{/*200*/}
                                {!existOtherUsers ? "There are no other users in your database." :
                                    this.users.map(({ user, notificationDoc }) => { // can't use async here
                                        const userKey = user.userDocumentId;
                                        const permissions = this.computePermissions(userKey);
                                        // const color = ColorMapping.get(permissions);

                                        // console.log(manager);
                                        // const metadata = manager[userKey] as Doc;
                                        // const usersShared = StrCast(metadata?.usersShared, "");
                                        // console.log(usersShared)


                                        return permissions === SharingPermissions.None ? null : (
                                            <div
                                                key={userKey}
                                                className={"container"}
                                            >
                                                <span className={"padding"}>{user.email}</span>
                                                {/* <div className={"shared-by"}>{usersShared}</div> */}
                                                <div className="edit-actions">
                                                    <select
                                                        className={"permissions-dropdown"}
                                                        value={permissions}
                                                        // style={{ color, borderColor: color }}
                                                        onChange={e => this.setInternalSharing({ user, notificationDoc }, e.currentTarget.value)}
                                                    >
                                                        {this.sharingOptions}
                                                    </select>
                                                </div>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </div>
                        <div className={"group-container"}>
                            <div className={"groups-list"} style={{ display: existGroups ? "block" : "flex", minHeight: existOtherUsers ? undefined : 150 }}>{/*200*/}
                                {!existGroups ? "There are no groups in your database." :
                                    GroupManager.Instance.getAllGroups().map(group => {
                                        const permissions = this.computePermissions(StrCast(group.groupName));
                                        // const color = ColorMapping.get(permissions);
                                        return permissions === SharingPermissions.None ? null : (
                                            <div
                                                key={StrCast(group.groupName)}
                                                className={"container"}
                                            >
                                                <span className={"padding"}>{group.groupName}</span>
                                                <div className="edit-actions">
                                                    <select
                                                        className={"permissions-dropdown"}
                                                        value={permissions}
                                                        // style={{ color, borderColor: color }}
                                                        onChange={e => this.setInternalGroupSharing(group, e.currentTarget.value)}
                                                    >
                                                        {this.sharingOptions}
                                                    </select>
                                                    <button onClick={action(() => GroupManager.Instance.currentGroup = group)}>Edit</button>
                                                </div>
                                            </div>
                                        );
                                    })

                                }

                            </div>
                        </div>
                    </div>

                </div>
                <div className={"close-button"} onClick={this.close}>Done</div>
            </div>
        );
    }

    render() {
        // console.log(this.sharingDoc);
        return (
            <MainViewModal
                contents={this.sharingInterface}
                isDisplayed={this.isOpen}
                interactive={true}
                dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                overlayDisplayedOpacity={this.overlayOpacity}
            />
        );
    }

}