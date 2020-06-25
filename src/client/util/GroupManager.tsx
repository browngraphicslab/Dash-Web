import * as React from "react";
import { observable, action, runInAction, computed } from "mobx";
import { SelectionManager } from "./SelectionManager";
import MainViewModal from "../views/MainViewModal";
import { observer } from "mobx-react";
import { Doc, DocListCast, Opt } from "../../fields/Doc";
import { List } from "../../fields/List";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as fa from '@fortawesome/free-solid-svg-icons';
import { library } from "@fortawesome/fontawesome-svg-core";
import SharingManager, { User } from "./SharingManager";
import { Utils } from "../../Utils";
import * as RequestPromise from "request-promise";
import Select from 'react-select';
import "./GroupManager.scss";

library.add(fa.faWindowClose);

interface UserOptions {
    label: string;
    value: string;
}

@observer
export default class GroupManager extends React.Component<{}> {

    static Instance: GroupManager;
    @observable private isOpen: boolean = false; // whether the menu is open or not
    @observable private dialogueBoxOpacity: number = 1;
    @observable private overlayOpacity: number = 0.4;
    @observable private users: string[] = [];
    @observable private selectedUsers: UserOptions[] | null = null;
    @observable private currentGroupModal: Opt<Doc>;
    private inputRef: React.RefObject<HTMLInputElement> = React.createRef();

    constructor(props: Readonly<{}>) {
        super(props);
        GroupManager.Instance = this;
    }

    componentDidMount() {
        console.log("mounted");
    }

    populateUsers = async () => {
        const userList: User[] = JSON.parse(await RequestPromise.get(Utils.prepend("/getUsers")));
        const currentUserIndex = userList.findIndex(user => user.email === Doc.CurrentUserEmail);
        currentUserIndex !== -1 && userList.splice(currentUserIndex, 1);
        return userList.map(user => user.email);
    }

    @computed get options() {
        return this.users.map(user => ({ label: user, value: user }));
    }

    open = action(() => {
        SelectionManager.DeselectAll();
        this.isOpen = true;
        this.populateUsers().then(resolved => runInAction(() => this.users = resolved));
    });

    close = action(() => {
        this.isOpen = false;
        this.currentGroupModal = undefined;
    });

    get GroupManagerDoc(): Doc | undefined {
        return Doc.UserDoc().globalGroupDatabase as Doc;
    }

    getAllGroups(): Doc[] {
        const groupDoc = GroupManager.Instance.GroupManagerDoc;
        return groupDoc ? DocListCast(groupDoc.data) : [];
    }

    getGroup(groupName: string): Doc | undefined {
        const groupDoc = GroupManager.Instance.getAllGroups().find(group => group.groupName === groupName);
        return groupDoc;
    }

    get adminGroupMembers(): string[] {
        return GroupManager.Instance.getGroup("admin") ? JSON.parse(GroupManager.Instance.getGroup("admin")!.members as string) : "";
    }

    hasEditAccess(groupDoc: Doc): boolean {
        if (!groupDoc) return false;
        const accessList: string[] = JSON.parse(groupDoc.owners as string);
        return accessList.includes(Doc.CurrentUserEmail) || GroupManager.Instance.adminGroupMembers?.includes(Doc.CurrentUserEmail);
    }

    createGroupDoc(groupName: string, memberEmails: string[]) {
        const groupDoc = new Doc;
        groupDoc.groupName = groupName;
        groupDoc.owners = JSON.stringify([Doc.CurrentUserEmail]);
        groupDoc.members = JSON.stringify(memberEmails);
        this.addGroup(groupDoc);
    }

    addGroup(groupDoc: Doc): boolean {
        if (GroupManager.Instance.GroupManagerDoc) {
            Doc.AddDocToList(GroupManager.Instance.GroupManagerDoc, "data", groupDoc);
            return true;
        }
        return false;
    }

    deleteGroup(groupName: string): boolean {
        const groupDoc = GroupManager.Instance.getGroup(groupName);
        if (groupDoc) {
            if (GroupManager.Instance.GroupManagerDoc && GroupManager.Instance.hasEditAccess(groupDoc)) {
                Doc.RemoveDocFromList(GroupManager.Instance.GroupManagerDoc, "data", groupDoc);
                return true;
            }
        }


        return false;
    }

    addMemberToGroup(groupDoc: Doc, email: string) {
        if (GroupManager.Instance.hasEditAccess(groupDoc)) {
            const memberList: string[] = JSON.parse(groupDoc.members as string);
            !memberList.includes(email) && memberList.push(email);
            groupDoc.members = JSON.stringify(memberList);
        }
    }

    removeMemberFromGroup(groupDoc: Doc, email: string) {
        if (GroupManager.Instance.hasEditAccess(groupDoc)) {
            const memberList: string[] = JSON.parse(groupDoc.members as string);
            const index = memberList.indexOf(email);
            index !== -1 && memberList.splice(index, 1);
            groupDoc.members = JSON.stringify(memberList);
        }
    }

    @action
    handleChange = (selectedOptions: any) => {
        console.log(selectedOptions);
        this.selectedUsers = selectedOptions as UserOptions[];
    }

    @action
    createGroup = () => {
        if (!this.inputRef.current?.value) {
            alert("Please enter a group name");
            return;
        }
        if (!this.selectedUsers) {
            alert("Please select users");
            return;
        }
        if (this.getAllGroups().find(group => group.groupName === this.inputRef.current!.value)) { // why do I need  null check here?
            alert("Please select a unique group name");
            return;
        }
        this.createGroupDoc(this.inputRef.current.value, this.selectedUsers.map(user => user.value));
        this.selectedUsers = null;
        this.inputRef.current.value = "";
    }

    private get editingInterface() {
        return (
            // <div className="editing-interface">

            // </div>
            "HEY HEY"
        );

    }


    private get groupInterface() {
        return (
            <div className="group-interface">
                <MainViewModal
                    contents={this.editingInterface}
                    isDisplayed={this.currentGroupModal ? true : false}
                    interactive={true}
                    dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                    overlayDisplayedOpacity={this.overlayOpacity}
                />
                <div className="group-heading">
                    <h1>Groups</h1>
                    <div className={"close-button"} onClick={this.close}>
                        <FontAwesomeIcon icon={fa.faWindowClose} size={"lg"} />
                    </div>
                </div>
                <div className="group-body">
                    <div className="group-create">
                        <button onClick={this.createGroup}>Create group</button>
                        <input ref={this.inputRef} type="text" placeholder="Group name" />
                        <Select
                            isMulti={true}
                            isSearchable={true}
                            options={this.options}
                            onChange={this.handleChange}
                            placeholder={"Select users"}
                            value={this.selectedUsers}
                            closeMenuOnSelect={false}
                        />
                    </div>
                    <div className="group-content">
                        {this.getAllGroups().map(group =>
                            <div className="group-row">
                                <div className="group-name">{group.groupName}</div>
                                <button onClick={action(() => this.currentGroupModal = group)}>
                                    {this.hasEditAccess(this.getGroup(group.groupName as string) as Doc) ? "Edit" : "View"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    render() {
        return (
            <MainViewModal
                contents={this.groupInterface}
                isDisplayed={this.isOpen}
                interactive={true}
                dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                overlayDisplayedOpacity={this.overlayOpacity}
            />
        );
    }

}