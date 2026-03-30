from utils import create_user, format_greeting

class UserService:
    def get_user(self, name):
        return create_user(name)

    def greet(self, name):
        return format_greeting(name)

class AdminService(UserService):
    def get_admin(self, name):
        user = self.get_user(name)
        user["role"] = "admin"
        return user

def main():
    service = AdminService()
    print(service.get_admin("World"))
