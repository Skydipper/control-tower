class UserTempSerializer {

    static serializeElement(el) {
        return {
            id: el.id,
            email: el.email,
            name: el.name,
            photo: el.photo,
            createdAt: el.createdAt,
            role: el.role,
            extraUserData: el.extraUserData
        };
    }

    static serialize(data) {
        const result = {};
        if (data && Array.isArray(data) && data.length === 0) {
            result.data = [];
            return result;
        }
        if (data) {
            if (Array.isArray(data)) {
                result.data = UserTempSerializer.serializeElement(data[0]);
            } else {
                result.data = UserTempSerializer.serializeElement(data);
            }
        }
        return result;
    }

}

module.exports = UserTempSerializer;
